"""
rag_pipeline.py

The three moving pieces of the "offline AI" engine:

  1. Transcriber   — faster-whisper turns audio into timestamped text segments
  2. VectorStore    — ChromaDB embeds + stores those segments for retrieval
  3. LocalLLM       — Ollama (a locally-running model) does summarization and
                       answers questions using the segments VectorStore
                       retrieves (this retrieve-then-generate pattern is RAG)

Nothing here calls out to the network. Whisper and Ollama both run on your
machine; ChromaDB's default embedding model is downloaded once from
Hugging Face on first use and cached locally after that — see the note on
VectorStore below if you want that to be true zero-network from the start.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

import chromadb
import ollama

CHROMA_DIR = Path(__file__).parent / "chroma_storage"
COLLECTION_NAME = "meeting_transcripts"

WHISPER_MODEL_SIZE = "base"  # tiny / base / small / medium / large-v3 — bigger = more accurate, slower
LLM_MODEL = "llama3.2"       # must already be pulled locally: `ollama pull llama3.1`


# =========================================================================
# 1. Transcription (speech -> timestamped text)
# =========================================================================

class Transcriber:
    """Thin wrapper around faster-whisper. Loads the model once and reuses it
    across requests — model load is the expensive part, not transcription."""

    _model = None

    @classmethod
    def _get_model(cls):
        if cls._model is None:
            from faster_whisper import WhisperModel
            # int8 keeps this usable on CPU-only machines; switch device="cuda"
            # and compute_type="float16" if a GPU is available.
            cls._model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
        return cls._model

    @classmethod
    def transcribe(cls, audio_path: str) -> list[dict]:
        """Returns a list of {text, start, end} segments in chronological order."""
        model = cls._get_model()
        segments, _info = model.transcribe(audio_path, vad_filter=True)
        return [
            {"text": seg.text.strip(), "start": seg.start, "end": seg.end}
            for seg in segments
            if seg.text.strip()
        ]


# =========================================================================
# Speaker assignment (placeholder — diarization not wired in yet)
# =========================================================================
#
# A pause-based heuristic ("a silence gap of N seconds means a new
# speaker") was the first attempt here, but real meetings interrupt and
# talk over each other constantly — someone breaking into the middle of
# another person's sentence is normal, not an edge case. Silence gaps are
# a poor proxy for turn-taking in that setting, and a confidently wrong
# speaker label is worse than an honest "unknown."
#
# So for now every segment gets one generic label. When you're ready for
# real diarization, the right tool is a model that analyzes the audio
# waveform itself (voice characteristics, not timing) — pyannote.audio is
# the standard choice, it returns per-segment speaker labels you'd merge
# in here. `speaker` is treated as an opaque string everywhere downstream
# (storage, embeddings, RAG), so swapping this one function is all it
# takes — nothing else needs to change.

def assign_speakers(segments: list[dict]) -> list[dict]:
    return [{**seg, "speaker": "Speaker"} for seg in segments]


# =========================================================================
# 2. Vector store (embed + retrieve transcript segments)
# =========================================================================

class VectorStore:
    """One ChromaDB collection holds every meeting's segments, filtered by
    meeting_id metadata at query time. Simpler to operate than one
    collection per meeting, and Chroma's metadata filtering makes the
    per-meeting isolation free.

    Note on "offline": Chroma's default embedding function pulls a small
    sentence-transformer (all-MiniLM-L6-v2) from Hugging Face the first
    time it runs, then caches it locally. If you need the very first run
    to also be offline, pre-download that model or pass in your own
    embedding_function (e.g. one backed by a local Ollama embedding model)
    when constructing the client.
    """

    def __init__(self):
        self._client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        self._collection = self._client.get_or_create_collection(COLLECTION_NAME)

    def add_segments(self, meeting_id: str, segments: list[dict]) -> None:
        """segments: list of {id, speaker, text} (as stored in SQLite)."""
        if not segments:
            return
        self._collection.upsert(
            ids=[seg["id"] for seg in segments],
            documents=[seg["text"] for seg in segments],
            metadatas=[{"meeting_id": meeting_id, "speaker": seg["speaker"]} for seg in segments],
        )

    def query(self, meeting_id: str, question: str, top_k: int = 5) -> list[dict]:
        results = self._collection.query(
            query_texts=[question],
            n_results=top_k,
            where={"meeting_id": meeting_id},
        )
        if not results["documents"] or not results["documents"][0]:
            return []
        return [
            {"text": doc, "speaker": meta["speaker"]}
            for doc, meta in zip(results["documents"][0], results["metadatas"][0])
        ]

    def delete_meeting(self, meeting_id: str) -> None:
        self._collection.delete(where={"meeting_id": meeting_id})


_vector_store: Optional[VectorStore] = None


def get_vector_store() -> VectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store


# =========================================================================
# 3. Local LLM (summarization + RAG question answering via Ollama)
# =========================================================================

def _strip_code_fences(text: str) -> str:
    return re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()


def _extract_json_object(text: str) -> dict:
    """Ollama models sometimes wrap JSON in prose despite instructions.
    Pull out the first {...} block and parse that."""
    cleaned = _strip_code_fences(text)
    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in model output: {text[:200]}")
    return json.loads(match.group(0))


SUMMARY_SYSTEM_PROMPT = """You are summarizing a meeting transcript for the \
person who attended it. Respond with ONLY a JSON object, no prose before or \
after, in exactly this shape:

{
  "key_points": ["..."],
  "decisions": ["..."],
  "action_items": [{"text": "...", "owner": "...", "due": "..."}]
}

Rules:
- key_points: the important things that were discussed or established.
- decisions: things the group explicitly agreed on or decided.
- action_items: concrete follow-up tasks. If no owner or due date was \
mentioned, use "Unassigned" and "—".
- If a category has nothing relevant, return an empty list for it.
- Keep each entry to one concise sentence.
- The transcript doesn't distinguish speakers yet, so don't invent who \
said what — describe what was discussed/decided without attributing it \
to a specific named person unless a name is actually in the text.
"""


def summarize_transcript(segments: list[dict]) -> dict:
    """segments: [{speaker, text}, ...] in chronological order."""
    if not segments:
        return {"key_points": [], "decisions": [], "action_items": []}

    transcript_text = "\n".join(f"{seg['speaker']}: {seg['text']}" for seg in segments)

    response = ollama.chat(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": f"Transcript:\n\n{transcript_text}"},
        ],
        options={"temperature": 0.2},
    )

    try:
        parsed = _extract_json_object(response["message"]["content"])
    except (ValueError, json.JSONDecodeError):
        # Local models occasionally misbehave on format — fail soft rather
        # than 500 the request.
        return {"key_points": [], "decisions": [], "action_items": []}

    return {
        "key_points": parsed.get("key_points", []),
        "decisions": parsed.get("decisions", []),
        "action_items": parsed.get("action_items", []),
    }


ASK_SYSTEM_PROMPT = """You answer questions about a meeting using only the \
transcript excerpts you're given. If the excerpts don't contain the answer, \
say so plainly rather than guessing. The transcript doesn't distinguish \
speakers yet, so don't claim a specific person said something unless a \
name actually appears in the excerpts — refer to "someone in the meeting" \
instead. Keep answers short."""


def answer_question(meeting_id: str, question: str, vector_store: VectorStore) -> str:
    matches = vector_store.query(meeting_id, question, top_k=5)

    if not matches:
        return "I couldn't find anything about that in this transcript."

    context = "\n".join(f"{m['speaker']}: {m['text']}" for m in matches)

    response = ollama.chat(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": ASK_SYSTEM_PROMPT},
            {"role": "user", "content": f"Transcript excerpts:\n{context}\n\nQuestion: {question}"},
        ],
        options={"temperature": 0.3},
    )
    return response["message"]["content"].strip()

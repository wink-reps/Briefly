"""
main.py

Thin FastAPI layer over database.py (persistence) and rag_pipeline.py
(Whisper / ChromaDB / Ollama). Run with:

    uvicorn main:app --reload --port 8000

Expects an Ollama server already running locally (`ollama serve`) with the
model in rag_pipeline.LLM_MODEL pulled (`ollama pull llama3.1`).
"""

import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database as db
import rag_pipeline as rag

app = FastAPI(title="Offline Meeting Summarizer API")

# Vite's default dev ports — add your deployed frontend origin here too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    db.init_db()


# ---------- Request bodies ----------

class CreateMeetingBody(BaseModel):
    title: str = "New meeting"


class RenameMeetingBody(BaseModel):
    title: str


class NoteBody(BaseModel):
    text: str


class AskBody(BaseModel):
    question: str


# ---------- Helpers ----------

def _meeting_or_404(meeting_id: str) -> dict:
    meeting = db.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


def _full_meeting_payload(meeting_id: str) -> dict:
    meeting = _meeting_or_404(meeting_id)
    return {
        **meeting,
        "transcript": db.get_segments(meeting_id),
        "summary": db.get_summary(meeting_id),
        "ask_thread": db.get_ask_thread(meeting_id),
    }


# ---------- Meetings ----------

@app.get("/meetings")
def list_meetings():
    return db.list_meetings()


@app.post("/meetings")
def create_meeting(body: CreateMeetingBody):
    return db.create_meeting(body.title)


@app.get("/meetings/{meeting_id}")
def get_meeting(meeting_id: str):
    return _full_meeting_payload(meeting_id)


@app.patch("/meetings/{meeting_id}")
def rename_meeting(meeting_id: str, body: RenameMeetingBody):
    _meeting_or_404(meeting_id)
    db.rename_meeting(meeting_id, body.title)
    return db.get_meeting(meeting_id)


@app.delete("/meetings/{meeting_id}")
def delete_meeting(meeting_id: str):
    _meeting_or_404(meeting_id)
    db.delete_meeting(meeting_id)
    rag.get_vector_store().delete_meeting(meeting_id)
    return {"deleted": True}


# ---------- Capturing the transcript ----------

@app.post("/meetings/{meeting_id}/notes")
def add_note(meeting_id: str, body: NoteBody):
    """A typed note — always attributed to the user."""
    _meeting_or_404(meeting_id)
    segment = db.add_segment(meeting_id, speaker="You", text=body.text, is_self=True)
    rag.get_vector_store().add_segments(meeting_id, [segment])
    return segment


@app.post("/meetings/{meeting_id}/transcribe")
async def transcribe_audio(meeting_id: str, file: UploadFile):
    """Upload an audio clip (a whole meeting recording, or one chunk of a
    continuously-streamed one) — transcribes it and stores + embeds the
    resulting segments. Speaker labels are generic for now — see the
    comment above assign_speakers() in rag_pipeline.py."""
    _meeting_or_404(meeting_id)

    suffix = Path(file.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        raw_segments = rag.Transcriber.transcribe(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    labeled = rag.assign_speakers(raw_segments)

    stored = []
    for seg in labeled:
        duration = round(seg["end"] - seg["start"], 1)
        stored.append(db.add_segment(meeting_id, speaker=seg["speaker"], text=seg["text"],
                                      is_self=False, duration_sec=duration))

    rag.get_vector_store().add_segments(meeting_id, stored)
    return stored


@app.get("/meetings/{meeting_id}/transcript")
def get_transcript(meeting_id: str):
    _meeting_or_404(meeting_id)
    return db.get_segments(meeting_id)


# ---------- Summarization ----------

@app.post("/meetings/{meeting_id}/summarize")
def summarize(meeting_id: str):
    _meeting_or_404(meeting_id)
    segments = db.get_segments(meeting_id)
    result = rag.summarize_transcript(segments)
    return db.save_summary(meeting_id, result["key_points"], result["decisions"], result["action_items"])


# ---------- Ask AI (RAG) ----------

@app.post("/meetings/{meeting_id}/ask")
def ask(meeting_id: str, body: AskBody):
    _meeting_or_404(meeting_id)
    db.add_ask_message(meeting_id, role="user", text=body.question)

    answer = rag.answer_question(meeting_id, body.question, rag.get_vector_store())

    ai_message = db.add_ask_message(meeting_id, role="ai", text=answer)
    return ai_message

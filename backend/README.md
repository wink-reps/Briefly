# Backend — Offline Meeting Summarizer

FastAPI + Whisper (STT) + ChromaDB (vector store) + Ollama (local LLM),
wired together for transcription, summarization, and RAG-based Q&A over a
meeting transcript.

## Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

You also need [Ollama](https://ollama.com) installed and running locally,
with a model pulled:

```bash
ollama pull llama3.1
ollama serve   # if it isn't already running as a background service
```

No API keys anywhere in this stack — Whisper and ChromaDB run in-process,
and Ollama is a local server on your machine, not a cloud API.

## Run

```bash
uvicorn main:app --reload --port 8000
```

`meetings.db` (SQLite) and `chroma_storage/` (vector DB) are created
automatically on first run — nothing to set up by hand.

## Endpoints

| Method | Path                              | Purpose                                  |
|--------|-----------------------------------|-------------------------------------------|
| GET    | `/meetings`                       | List all meetings                        |
| POST   | `/meetings`                       | Create a meeting `{title}`                |
| GET    | `/meetings/{id}`                  | Full detail: transcript + summary + Q&A   |
| PATCH  | `/meetings/{id}`                  | Rename `{title}`                          |
| DELETE | `/meetings/{id}`                  | Delete a meeting (and its vectors)        |
| POST   | `/meetings/{id}/notes`            | Add a typed note `{text}`, as "You"       |
| POST   | `/meetings/{id}/transcribe`       | Upload audio (multipart `file`) → Whisper |
| GET    | `/meetings/{id}/transcript`       | Just the transcript segments              |
| POST   | `/meetings/{id}/summarize`        | Run summarization, store + return it      |
| POST   | `/meetings/{id}/ask`              | Ask a question `{question}` (RAG)         |

## How a recording flows through the system

1. Frontend uploads an audio chunk to `POST /meetings/{id}/transcribe`.
2. `Transcriber` (faster-whisper) turns it into timestamped text segments.
3. `assign_speakers` labels segments generically for now — **not real
   diarization**. See the comment above that function in
   `rag_pipeline.py` for why (real meetings interrupt and overlap, so a
   pause-based guess was actively misleading) and how to wire in a real
   one later (e.g. pyannote.audio).
4. Segments are saved to SQLite (`database.py`) and embedded into
   ChromaDB (`VectorStore`) in the same step.
5. `POST /meetings/{id}/summarize` sends the full transcript to the local
   Ollama model with a prompt asking for structured JSON back — the
   prompt is explicitly told not to invent who said what, since speakers
   aren't distinguished yet.
6. `POST /meetings/{id}/ask` embeds the question, retrieves the closest
   transcript segments from Chroma, and asks Ollama to answer using only
   that retrieved context — the RAG pattern.

## Honest caveats

- **No speaker separation yet.** Every live-captured segment is labeled
  generically ("Speaker"). Typed notes are still attributed to "You"
  since that's the one thing we can actually be sure of. Add real
  diarization when you're ready — see `assign_speakers` in
  `rag_pipeline.py`.
- **ChromaDB's default embedding model downloads once from Hugging Face**
  on first use, then is cached locally. If "offline from the very first
  run" matters, pre-cache that model or pass a custom local embedding
  function into `VectorStore.__init__`.
- **Ollama itself must be running** (`ollama serve`) — this backend is a
  client of it, not a bundled model runtime.

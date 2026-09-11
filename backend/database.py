"""
SQLite persistence layer.

Everything the frontend needs (meetings list, transcript segments,
generated summary, ask-AI thread) lives in a handful of plain tables in
meetings.db. No ORM — the schema is small enough that raw SQL is easier
to reason about and easier to explain in an interview.
"""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "meetings.db"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS meetings (
                id           TEXT PRIMARY KEY,
                title        TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                duration_sec INTEGER NOT NULL DEFAULT 0,
                status       TEXT NOT NULL DEFAULT 'idle'
            );

            CREATE TABLE IF NOT EXISTS segments (
                id            TEXT PRIMARY KEY,
                meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                seq           INTEGER NOT NULL,
                speaker       TEXT NOT NULL,
                is_self       INTEGER NOT NULL DEFAULT 0,
                text          TEXT NOT NULL,
                created_at    TEXT NOT NULL,
                duration_sec  REAL
            );
            CREATE INDEX IF NOT EXISTS idx_segments_meeting ON segments(meeting_id);

            CREATE TABLE IF NOT EXISTS summaries (
                meeting_id    TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
                key_points    TEXT NOT NULL,
                decisions     TEXT NOT NULL,
                action_items  TEXT NOT NULL,
                generated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ask_messages (
                id            TEXT PRIMARY KEY,
                meeting_id    TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                role          TEXT NOT NULL CHECK (role IN ('user', 'ai')),
                text          TEXT NOT NULL,
                created_at    TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ask_meeting ON ask_messages(meeting_id);
            """
        )


# ---------- Meetings ----------

def create_meeting(title: str) -> dict:
    meeting_id = new_id("m")
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO meetings (id, title, created_at, duration_sec, status) VALUES (?, ?, ?, 0, 'idle')",
            (meeting_id, title, _now_iso()),
        )
    return get_meeting(meeting_id)


def list_meetings() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM meetings ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def get_meeting(meeting_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,)).fetchone()
    return dict(row) if row else None


def delete_meeting(meeting_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))


def rename_meeting(meeting_id: str, title: str) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE meetings SET title = ? WHERE id = ?", (title, meeting_id))


def set_meeting_status(meeting_id: str, status: str) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE meetings SET status = ? WHERE id = ?", (status, meeting_id))


# ---------- Segments (transcript) ----------

def add_segment(meeting_id: str, speaker: str, text: str, is_self: bool = False,
                 duration_sec: float | None = None) -> dict:
    with get_connection() as conn:
        seq = conn.execute(
            "SELECT COALESCE(MAX(seq), -1) + 1 FROM segments WHERE meeting_id = ?", (meeting_id,)
        ).fetchone()[0]
        segment_id = new_id("seg")
        created_at = _now_iso()
        conn.execute(
            """INSERT INTO segments (id, meeting_id, seq, speaker, is_self, text, created_at, duration_sec)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (segment_id, meeting_id, seq, speaker, int(is_self), text, created_at, duration_sec),
        )
        conn.execute("UPDATE meetings SET status = 'captured' WHERE id = ?", (meeting_id,))
    return {
        "id": segment_id, "meeting_id": meeting_id, "seq": seq, "speaker": speaker,
        "is_self": is_self, "text": text, "created_at": created_at, "duration_sec": duration_sec,
    }


def get_segments(meeting_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM segments WHERE meeting_id = ? ORDER BY seq ASC", (meeting_id,)
        ).fetchall()
    return [dict(r) for r in rows]


# ---------- Summary ----------

def save_summary(meeting_id: str, key_points: list, decisions: list, action_items: list) -> dict:
    generated_at = _now_iso()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO summaries (meeting_id, key_points, decisions, action_items, generated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(meeting_id) DO UPDATE SET
                 key_points=excluded.key_points,
                 decisions=excluded.decisions,
                 action_items=excluded.action_items,
                 generated_at=excluded.generated_at""",
            (meeting_id, json.dumps(key_points), json.dumps(decisions), json.dumps(action_items), generated_at),
        )
        conn.execute("UPDATE meetings SET status = 'summarized' WHERE id = ?", (meeting_id,))
    return get_summary(meeting_id)


def get_summary(meeting_id: str) -> dict:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM summaries WHERE meeting_id = ?", (meeting_id,)).fetchone()
    if not row:
        return {"key_points": [], "decisions": [], "action_items": [], "generated_at": None}
    return {
        "key_points": json.loads(row["key_points"]),
        "decisions": json.loads(row["decisions"]),
        "action_items": json.loads(row["action_items"]),
        "generated_at": row["generated_at"],
    }


# ---------- Ask-AI thread ----------

def add_ask_message(meeting_id: str, role: str, text: str) -> dict:
    message_id = new_id("ask")
    created_at = _now_iso()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO ask_messages (id, meeting_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)",
            (message_id, meeting_id, role, text, created_at),
        )
    return {"id": message_id, "meeting_id": meeting_id, "role": role, "text": text, "created_at": created_at}


def get_ask_thread(meeting_id: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM ask_messages WHERE meeting_id = ? ORDER BY created_at ASC", (meeting_id,)
        ).fetchall()
    return [dict(r) for r in rows]

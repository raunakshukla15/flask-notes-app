from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "notes.db"


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["TEMPLATES_AUTO_RELOAD"] = True

    init_db()

    @app.get("/")
    def index():
        notes = fetch_notes()
        return render_template("index.html", notes=notes)

    @app.get("/api/notes")
    def api_list_notes():
        return jsonify({"notes": [n.to_dict() for n in fetch_notes()]})

    @app.post("/api/notes")
    def api_create_note():
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        deadline = (data.get("deadline") or "").strip()
        if not text:
            return jsonify({"error": "Note text is required."}), 400

        deadline_iso = normalize_deadline(deadline)
        note = insert_note(text=text, deadline=deadline_iso)
        return jsonify({"note": note.to_dict()}), 201

    @app.put("/api/notes/<int:note_id>")
    def api_update_note(note_id: int):
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        deadline = (data.get("deadline") or "").strip()
        if not text:
            return jsonify({"error": "Note text is required."}), 400

        deadline_iso = normalize_deadline(deadline)
        updated = update_note(note_id=note_id, text=text, deadline=deadline_iso)
        if updated is None:
            return jsonify({"error": "Note not found."}), 404
        return jsonify({"note": updated.to_dict()})

    @app.delete("/api/notes/<int:note_id>")
    def api_delete_note(note_id: int):
        ok = delete_note(note_id)
        if not ok:
            return jsonify({"error": "Note not found."}), 404
        return jsonify({"ok": True})

    @app.get("/about")
    def about():
        return render_template("about.html")

    return app


@dataclass(frozen=True)
class Note:
    id: int
    text: str
    created_at: str  # ISO
    updated_at: str  # ISO
    deadline: str | None  # ISO

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "text": self.text,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "deadline": self.deadline,
        }


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS notes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              text TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              deadline TEXT
            );
            """
        )
        conn.commit()


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat(timespec="seconds")


def normalize_deadline(value: str) -> str | None:
    """
    Accepts:
      - "" -> None
      - "YYYY-MM-DDTHH:MM" (from datetime-local) -> ISO seconds
      - ISO-like strings -> stored as-is if parseable
    """
    if not value:
        return None
    value = value.strip()
    try:
        # datetime-local typically has no seconds; we normalize.
        dt = datetime.fromisoformat(value)
        return dt.replace(microsecond=0).isoformat(timespec="seconds")
    except ValueError:
        return None


def fetch_notes() -> list[Note]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, text, created_at, updated_at, deadline FROM notes ORDER BY id DESC"
        ).fetchall()
    return [
        Note(
            id=row["id"],
            text=row["text"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            deadline=row["deadline"],
        )
        for row in rows
    ]


def insert_note(text: str, deadline: str | None) -> Note:
    created = now_iso()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO notes (text, created_at, updated_at, deadline) VALUES (?, ?, ?, ?)",
            (text, created, created, deadline),
        )
        conn.commit()
        note_id = int(cur.lastrowid)
        row = conn.execute(
            "SELECT id, text, created_at, updated_at, deadline FROM notes WHERE id = ?",
            (note_id,),
        ).fetchone()
    return Note(
        id=row["id"],
        text=row["text"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        deadline=row["deadline"],
    )


def update_note(note_id: int, text: str, deadline: str | None) -> Note | None:
    updated = now_iso()
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE notes SET text = ?, updated_at = ?, deadline = ? WHERE id = ?",
            (text, updated, deadline, note_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT id, text, created_at, updated_at, deadline FROM notes WHERE id = ?",
            (note_id,),
        ).fetchone()
    return Note(
        id=row["id"],
        text=row["text"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        deadline=row["deadline"],
    )


def delete_note(note_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        conn.commit()
        return cur.rowcount > 0


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="127.0.0.1", port=port, debug=True)

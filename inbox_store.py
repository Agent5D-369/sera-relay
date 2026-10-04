"""Durable local inbox, duplicate protection, and crash recovery."""
import sqlite3
from contextlib import contextmanager
import json
from pathlib import Path
import time


class Inbox:
    def __init__(self, home: Path):
        self.home = home.resolve()
        self.spool = self.home / "spool"
        self.spool.mkdir(parents=True, exist_ok=True)
        self.database = self.home / "inbox.sqlite3"
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY, sender TEXT NOT NULL, chat TEXT NOT NULL,
                timestamp INTEGER NOT NULL, status TEXT NOT NULL, path TEXT,
                transcript TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
                updated REAL NOT NULL)""")
            db.execute("UPDATE notes SET status='queued' WHERE status='processing'")
            db.execute("UPDATE notes SET status='failed', error='Download interrupted. Select Retry.' WHERE status='downloading'")
        for receipt in self.spool.glob('*.audio.json'):
            try:
                self.ingest(json.loads(receipt.read_text(encoding='utf-8')))
            except (OSError, ValueError, KeyError, TypeError):
                continue

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def ingest(self, event):
        identifier = event.get("id")
        if not isinstance(identifier, str) or not identifier or len(identifier) > 1024:
            raise ValueError("Invalid voice note identifier")
        kind = event["type"]
        audio = None
        if kind == "media":
            audio = Path(event["path"]).resolve()
            if audio.parent != self.spool or not audio.is_file() or audio.suffix != ".audio":
                raise ValueError("The voice note is outside the receiver folder")
        with self.connect() as db:
            db.execute("""INSERT OR IGNORE INTO notes(id,sender,chat,timestamp,status,updated)
                VALUES(?,?,?,?,?,?)""", (identifier, str(event.get("sender", "Unknown sender")),
                str(event.get("chat", "WhatsApp")), int(event.get("timestamp", time.time())), "downloading", time.time()))
            existing = db.execute("SELECT * FROM notes WHERE id=?", (identifier,)).fetchone()
            if existing["status"] == "done":
                if audio:
                    audio.unlink(missing_ok=True)
                    Path(str(audio) + '.json').unlink(missing_ok=True)
                return
            if kind == "media" and existing["status"] not in {"processing", "queued"}:
                db.execute("UPDATE notes SET sender=?,chat=?,status='queued',path=?,error='',updated=? WHERE id=?",
                           (str(event.get("sender", existing["sender"])), str(event.get("chat", existing["chat"])),
                            str(audio), time.time(), identifier))
            elif kind == "download_error" and existing["status"] not in {"processing", "queued"}:
                db.execute("UPDATE notes SET status='failed',error=?,updated=? WHERE id=?",
                           (event.get("error", "Download failed. Select Retry."), time.time(), identifier))

    def claim(self):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM notes WHERE status='queued' ORDER BY timestamp LIMIT 1").fetchone()
            if row:
                db.execute("UPDATE notes SET status='processing',updated=? WHERE id=?", (time.time(), row["id"]))
                return dict(row)

    def complete(self, identifier, transcript):
        with self.connect() as db:
            row = db.execute("SELECT path FROM notes WHERE id=?", (identifier,)).fetchone()
            db.execute("UPDATE notes SET status='done',transcript=?,error='',updated=? WHERE id=?",
                       (transcript, time.time(), identifier))
        if row and row["path"]:
            audio = Path(row["path"]).resolve()
            if audio.parent == self.spool:
                audio.unlink(missing_ok=True)
                Path(str(audio) + '.json').unlink(missing_ok=True)

    def fail(self, identifier, error):
        with self.connect() as db:
            db.execute("UPDATE notes SET status='failed',error=?,updated=? WHERE id=?", (str(error), time.time(), identifier))

    def rows(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute("SELECT * FROM notes ORDER BY timestamp DESC LIMIT 200")]

    def retry(self, identifier):
        with self.connect() as db:
            row = db.execute("SELECT * FROM notes WHERE id=? AND status='failed'", (identifier,)).fetchone()
            if not row:
                return False
            audio = Path(row["path"]).resolve() if row["path"] else None
            local = bool(audio and audio.parent == self.spool and audio.is_file())
            db.execute("UPDATE notes SET status=?,error='',updated=? WHERE id=?",
                       ("queued" if local else "downloading", time.time(), identifier))
            return local

    def handled_ids(self):
        with self.connect() as db:
            return [row['id'] for row in db.execute("SELECT id FROM notes WHERE status IN ('done','queued','processing')")]

    def get(self, identifier):
        with self.connect() as db:
            row = db.execute('SELECT * FROM notes WHERE id=?', (identifier,)).fetchone()
            return dict(row) if row else None

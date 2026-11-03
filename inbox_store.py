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
            columns = {row['name'] for row in db.execute('PRAGMA table_info(notes)')}
            if 'reviewed_at' not in columns:
                db.execute("ALTER TABLE notes ADD COLUMN reviewed_at REAL")
            if 'kind' not in columns:
                db.execute("ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'voice'")
            # Written selections: which WhatsApp messages each item holds. item_id 'dismissed' = handled, not sent.
            db.execute("CREATE TABLE IF NOT EXISTS text_sources (message_id TEXT NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY(message_id,item_id))")
            db.execute("CREATE TABLE IF NOT EXISTS inbox_messages (id TEXT PRIMARY KEY, chat TEXT NOT NULL, timestamp INTEGER NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
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

    def set_reviewed(self, identifier, reviewed):
        """Local-only marker: the person looked at this transcript. Never sent to Sera."""
        with self.connect() as db:
            return db.execute("UPDATE notes SET reviewed_at=? WHERE id=? AND status='done'",
                              (time.time() if reviewed else None, identifier)).rowcount == 1

    def pending_review_count(self):
        """Transcribed notes that are neither marked reviewed nor saved to Sera."""
        with self.connect() as db:
            saved = "AND id NOT IN (SELECT id FROM memory_receipts WHERE url<>'')" if db.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='memory_receipts'").fetchone() else ''
            return db.execute("SELECT COUNT(*) FROM notes WHERE status='done' AND reviewed_at IS NULL " + saved).fetchone()[0]

    def add_text(self, event):
        """Store a written selection as a finished item, so it uses the same review and publish path as a transcript."""
        identifier, sources, transcript = event.get('id'), event.get('sources'), event.get('transcript')
        if not isinstance(identifier, str) or not identifier.startswith('text_') or len(identifier) > 1024:
            raise ValueError('Invalid message selection identifier')
        if (not isinstance(sources, list) or not 1 <= len(sources) <= 100
                or any(not isinstance(s, str) or not s or len(s) > 1024 for s in sources)):
            raise ValueError('Invalid message selection')
        if not isinstance(transcript, str) or not transcript.strip() or len(transcript) > 100000:
            raise ValueError('Invalid message text')
        with self.connect() as db:
            db.execute("""INSERT OR IGNORE INTO notes(id,sender,chat,timestamp,status,transcript,updated,kind)
                VALUES(?,?,?,?,'done',?,?,'text')""", (identifier, str(event.get('sender') or 'Unknown sender')[:500],
                str(event.get('chat') or 'WhatsApp')[:500], int(event.get('timestamp') or time.time()), transcript, time.time()))
            db.executemany('INSERT OR IGNORE INTO text_sources VALUES(?,?)', [(source, identifier) for source in sources])
            # A message that was handled without sending is no longer handled once it is sent.
            db.executemany("DELETE FROM text_sources WHERE message_id=? AND item_id='dismissed'", [(source,) for source in sources])

    def sources(self, identifier):
        with self.connect() as db:
            return [row['message_id'] for row in db.execute('SELECT message_id FROM text_sources WHERE item_id=? ORDER BY rowid', (identifier,))]

    def items_for(self, message_ids):
        with self.connect() as db:
            marks = ','.join('?' * len(message_ids))
            return list(dict.fromkeys(row['item_id'] for row in db.execute(
                f"SELECT item_id FROM text_sources WHERE item_id<>'dismissed' AND message_id IN ({marks})", message_ids))) if message_ids else []

    def dismiss(self, message_ids):
        with self.connect() as db:
            db.executemany("INSERT OR IGNORE INTO text_sources VALUES(?,'dismissed')", [(m,) for m in message_ids])

    def inbox(self):
        with self.connect() as db:
            values = {row['key']: row['value'] for row in db.execute("SELECT * FROM settings WHERE key LIKE 'inbox_%'")}
            if not values.get('inbox_chat'):
                return None
            pending = [row['id'] for row in db.execute(
                """SELECT id FROM inbox_messages WHERE chat=? AND timestamp>=? AND id NOT IN (SELECT message_id FROM text_sources)
                ORDER BY timestamp LIMIT 100""", (values['inbox_chat'], int(float(values.get('inbox_since', 0)))))]
        return {'chat': values['inbox_chat'], 'name': values.get('inbox_name', ''),
                'since': int(float(values.get('inbox_since', 0))), 'pending': pending}

    def set_inbox(self, chat, name):
        """Messages from before the chat was chosen are not counted as new; they can still be selected by hand."""
        with self.connect() as db:
            db.execute("DELETE FROM settings WHERE key LIKE 'inbox_%'")
            db.executemany('INSERT INTO settings VALUES(?,?)', [('inbox_chat', chat), ('inbox_name', name), ('inbox_since', str(int(time.time())))])

    def clear_inbox(self):
        with self.connect() as db:
            db.execute("DELETE FROM settings WHERE key LIKE 'inbox_%'")
            db.execute('DELETE FROM inbox_messages')

    def record_inbox_message(self, event):
        identifier, chat = event.get('id'), event.get('chat')
        if not all(isinstance(v, str) and v and len(v) <= 1024 for v in (identifier, chat)):
            raise ValueError('Invalid inbox message')
        current = self.inbox()
        if not current or current['chat'] != chat:
            return False
        with self.connect() as db:
            return db.execute('INSERT OR IGNORE INTO inbox_messages VALUES(?,?,?)',
                              (identifier, chat, int(event.get('timestamp') or time.time()))).rowcount == 1

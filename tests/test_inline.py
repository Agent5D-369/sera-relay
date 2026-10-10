import tempfile
import unittest
from pathlib import Path
from auto_app import AutoApp, silent_note_message
from inbox_store import Inbox


class InlineTests(unittest.TestCase):
    def test_saved_and_queued_messages_never_request_another_download(self):
        with tempfile.TemporaryDirectory() as folder:
            inbox = Inbox(Path(folder))
            audio = inbox.spool / 'voice.audio'
            audio.write_bytes(b'voice')
            inbox.ingest({'type': 'media', 'id': 'saved', 'path': str(audio)})
            inbox.claim()
            inbox.complete('saved', 'Existing transcript')
            audio = inbox.spool / 'next.audio'
            audio.write_bytes(b'next')
            inbox.ingest({'type': 'media', 'id': 'waiting', 'path': str(audio)})
            app = AutoApp.__new__(AutoApp)
            app.inbox = Inbox(Path(folder))
            app.inline = True
            app.inline_sent = {}
            commands = []
            app.command = commands.append
            app.inline_request('saved')
            app.inline_request('waiting')
            self.assertTrue(all(command['type'] in ('inline_states', 'inline_summary') for command in commands))
            commands[:] = [command for command in commands if command['type'] == 'inline_states']
            self.assertEqual(commands[0]['entries'][0]['transcript'], 'Existing transcript')
            app.inline_request('new')
            self.assertEqual(commands[-1], {'type': 'inline_download', 'id': 'new'})


    def test_reviewed_marker_is_local_and_drives_the_pending_count(self):
        with tempfile.TemporaryDirectory() as folder:
            inbox = Inbox(Path(folder))
            for name in ('one', 'two', 'three'):
                audio = inbox.spool / (name + '.audio')
                audio.write_bytes(b'voice')
                inbox.ingest({'type': 'media', 'id': name, 'path': str(audio)})
                inbox.claim()
                inbox.complete(name, 'Transcript ' + name)
            audio = inbox.spool / 'queued.audio'
            audio.write_bytes(b'voice')
            inbox.ingest({'type': 'media', 'id': 'queued', 'path': str(audio)})
            self.assertFalse(inbox.set_reviewed('queued', True))
            self.assertEqual(inbox.pending_review_count(), 3)
            app = AutoApp.__new__(AutoApp)
            app.inbox = inbox
            app.inline = True
            app.inline_sent = {}
            commands = []
            app.command = commands.append
            app.inline_states()
            self.assertIn({'type': 'inline_summary', 'pending': 3}, commands)
            self.assertTrue(inbox.set_reviewed('one', True))
            commands.clear()
            app.inline_states(['one'])
            self.assertTrue(commands[0]['entries'][0]['reviewed'])
            self.assertIn({'type': 'inline_summary', 'pending': 2}, commands)
            with inbox.connect() as db:
                db.execute("CREATE TABLE IF NOT EXISTS memory_receipts (endpoint TEXT, id TEXT, status TEXT, url TEXT NOT NULL DEFAULT '')")
                db.execute("INSERT INTO memory_receipts VALUES ('e','two','done','https://www.notion.so/x')")
            self.assertEqual(inbox.pending_review_count(), 1)
            inbox.set_reviewed('one', False)
            self.assertEqual(Inbox(Path(folder)).pending_review_count(), 2)
            self.assertIsNone(inbox.get('one')['reviewed_at'])


    def test_silent_note_message_names_the_cause_not_manual_recording(self):
        sent, received = silent_note_message('true_123@lid_ABC'), silent_note_message('false_123@lid_ABC')
        for text in (sent, received):
            self.assertIn('silent', text); self.assertNotIn('while recording', text)
        self.assertIn('re-record', sent); self.assertNotIn('re-record', received)


if __name__ == '__main__':
    unittest.main()

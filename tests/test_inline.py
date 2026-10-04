import tempfile
import unittest
from pathlib import Path
from auto_app import AutoApp
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
            self.assertTrue(all(command['type'] == 'inline_states' for command in commands))
            self.assertEqual(commands[0]['entries'][0]['transcript'], 'Existing transcript')
            app.inline_request('new')
            self.assertEqual(commands[-1], {'type': 'inline_download', 'id': 'new'})


if __name__ == '__main__':
    unittest.main()

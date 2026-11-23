import tempfile
import unittest
from pathlib import Path
from auto_app import AutoApp
from inbox_store import Inbox


class ResetLinkTests(unittest.TestCase):
    def app(self, folder):
        app = AutoApp.__new__(AutoApp)
        app.inbox = Inbox(Path(folder))
        return app

    def test_damaged_link_is_moved_aside_never_deleted(self):
        with tempfile.TemporaryDirectory() as folder:
            app = self.app(folder)
            session = app.inbox.home / 'auth' / 'session-voice-transcriber'
            session.mkdir(parents=True)
            (session / 'marker').write_text('kept', encoding='utf-8')
            moved = app.move_damaged_link()
            self.assertFalse((app.inbox.home / 'auth').exists())
            self.assertTrue(moved.name.startswith('auth-reset-'))
            self.assertEqual((moved / 'session-voice-transcriber' / 'marker').read_text(encoding='utf-8'), 'kept')
            # Transcripts and queue state stay where they are.
            self.assertTrue((app.inbox.home / 'inbox.sqlite3').exists())

    def test_reset_without_a_saved_link_does_nothing(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertIsNone(self.app(folder).move_damaged_link())


if __name__ == '__main__':
    unittest.main()

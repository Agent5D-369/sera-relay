import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inbox_store import Inbox


class InboxTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.home = Path(self.directory.name)
        self.inbox = Inbox(self.home)
        self.file = self.inbox.spool / 'received.audio'
        self.file.write_bytes(b'voice')
        self.event = {'type': 'media', 'id': 'voice-1', 'sender': 'Test Sender', 'chat': 'Test Chat',
                      'timestamp': 100, 'path': str(self.file)}

    def tearDown(self):
        self.directory.cleanup()

    def test_deduplication_transcript_and_audio_cleanup(self):
        self.inbox.ingest(self.event)
        self.inbox.ingest(self.event)
        row = self.inbox.claim()
        self.assertEqual(row['id'], 'voice-1')
        self.assertIsNone(self.inbox.claim())
        self.inbox.complete(row['id'], 'The meeting is tomorrow.')
        self.assertFalse(self.file.exists())
        self.assertEqual(self.inbox.rows()[0]['status'], 'done')
        self.file.write_bytes(b'redelivered voice')
        self.inbox.ingest(self.event)
        self.assertFalse(self.file.exists())
        self.assertIsNone(self.inbox.claim())
        self.assertEqual(self.inbox.rows()[0]['transcript'], 'The meeting is tomorrow.')

    def test_crash_recovers_in_progress_and_download_receipt(self):
        Path(str(self.file) + '.json').write_text(json.dumps(self.event), encoding='utf-8')
        self.inbox = Inbox(self.home)
        self.assertIsNotNone(self.inbox.claim())
        self.inbox = Inbox(self.home)
        self.assertIsNotNone(self.inbox.claim())
        self.inbox.complete('voice-1', 'Recovered')
        self.assertFalse(Path(str(self.file) + '.json').exists())

    def test_missing_and_external_files_are_rejected(self):
        outside = self.home / 'outside.audio'
        outside.write_bytes(b'outside')
        with self.assertRaises(ValueError):
            self.inbox.ingest({**self.event, 'path': str(outside)})
        self.assertTrue(outside.exists())

    def test_failed_transcription_can_retry_local_audio(self):
        self.inbox.ingest(self.event)
        self.inbox.claim()
        self.inbox.fail('voice-1', 'Temporary failure')
        self.assertTrue(self.inbox.retry('voice-1'))
        self.assertIsNotNone(self.inbox.claim())

    def test_missing_audio_retry_requires_receiver(self):
        self.inbox.ingest(self.event)
        self.inbox.claim()
        self.inbox.fail('voice-1', 'Missing audio')
        self.file.unlink()
        self.assertFalse(self.inbox.retry('voice-1'))
        self.assertEqual(self.inbox.rows()[0]['status'], 'downloading')

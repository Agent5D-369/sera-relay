"""Written WhatsApp messages: selection storage, the Sera inbox chat, and labeling when published."""
import json
from pathlib import Path
import tempfile
import time
import unittest

from auto_app import AutoApp
from inbox_store import Inbox
from sera_memory import SeraMemory
from test_memory_workflow import Client, URL

SELECTION = {'type': 'text_capture', 'id': 'text_' + 'a' * 40, 'sender': 'Ana, Bea', 'chat': 'Garden circle',
             'timestamp': 1791044400, 'sources': ['m1', 'm2'],
             'transcript': '[2026-10-03 09:00] Ana: We should meet Monday.\n[2026-10-03 09:01] Bea: Monday works.'}
TEXT_SCHEMA = {'publish_voice_memory': {'properties': {'source_kind': {'type': 'string', 'enum': ['voice', 'text']}}}}


def app_for(inbox):
    app = AutoApp.__new__(AutoApp)
    app.inbox, app.inline, app.inline_sent = inbox, True, {}
    commands = []
    app.command = commands.append
    return app, commands


class TextStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.inbox = Inbox(Path(self.temp.name))

    def test_selection_becomes_a_finished_item_that_needs_review(self):
        self.inbox.add_text(SELECTION)
        self.inbox.add_text(dict(SELECTION, transcript='A second capture never overwrites the first.'))
        row = self.inbox.get(SELECTION['id'])
        self.assertEqual((row['status'], row['kind'], row['transcript']), ('done', 'text', SELECTION['transcript']))
        self.assertEqual(self.inbox.sources(SELECTION['id']), ['m1', 'm2'])
        self.assertEqual(self.inbox.items_for(['m2', 'unknown']), [SELECTION['id']])
        self.assertEqual(self.inbox.pending_review_count(), 1)

    def test_invalid_selections_are_rejected(self):
        for bad in ({'id': 'voice'}, {'sources': []}, {'sources': ['x'] * 101}, {'transcript': ' '}, {'transcript': 'x' * 100001}):
            with self.assertRaises(ValueError):
                self.inbox.add_text(dict(SELECTION, **bad))

    def test_inbox_counts_only_new_unhandled_messages_in_the_chosen_chat(self):
        self.assertIsNone(self.inbox.inbox())
        self.inbox.set_inbox('group@g.us', 'Sera inbox')
        since = self.inbox.inbox()['since']
        record = lambda i, chat='group@g.us', at=since: self.inbox.record_inbox_message({'id': i, 'chat': chat, 'timestamp': at})
        self.assertTrue(record('m1')); self.assertFalse(record('m1'))
        record('m2'); record('m3'); record('old', at=since - 60)
        self.assertFalse(record('elsewhere', chat='other@c.us'))
        self.assertEqual(self.inbox.inbox()['pending'], ['m1', 'm2', 'm3'])
        self.inbox.add_text(SELECTION)
        self.inbox.dismiss(['m3'])
        self.assertEqual(self.inbox.inbox()['pending'], [])
        self.assertEqual(self.inbox.items_for(['m3']), [])
        self.inbox.clear_inbox()
        self.assertIsNone(self.inbox.inbox())

    def test_sending_a_handled_message_clears_the_handled_mark(self):
        self.inbox.dismiss(['m1'])
        self.inbox.add_text(SELECTION)
        with self.inbox.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM text_sources WHERE item_id='dismissed'").fetchone()[0], 0)

    def test_app_pushes_text_state_and_inbox_summary_to_the_page(self):
        app, commands = app_for(self.inbox)
        app.text_event(SELECTION)
        entry = next(c for c in commands if c['type'] == 'inline_states')['entries'][0]
        self.assertEqual((entry['id'], entry['kind'], entry['sources'], entry['status']), (SELECTION['id'], 'text', ['m1', 'm2'], 'done'))
        commands.clear()
        app.text_event({'type': 'inline_inbox_set', 'chat': 'group@g.us', 'name': 'Sera inbox'})
        config = next(c for c in commands if c['type'] == 'inbox_config')
        self.assertEqual(config['chat'], 'group@g.us'); self.assertLessEqual(config['since'], time.time())
        app.text_event({'type': 'inbox_message', 'id': 'm9', 'chat': 'group@g.us', 'timestamp': int(time.time()) + 5})
        summary = [c for c in commands if c['type'] == 'inline_summary'][-1]
        self.assertEqual(summary['inbox'], {'chat': 'group@g.us', 'name': 'Sera inbox', 'pending': ['m9']})
        commands.clear()
        app.text_event({'type': 'inline_text_lookup', 'ids': ['m1']})
        self.assertEqual(commands[0]['entries'][0]['id'], SELECTION['id'])
        app.text_event({'type': 'inline_inbox_clear'})
        self.assertEqual(next(c for c in commands if c['type'] == 'inbox_config')['chat'], '')


class TextPublishTests(unittest.TestCase):
    def setUp(self):
        Client.calls = []; Client.fail_body = False
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.inbox = Inbox(Path(self.temp.name))
        self.inbox.add_text(SELECTION)
        self.memory = SeraMemory(self.inbox, Client)
        self.memory.credentials = lambda: {'endpoint': 'https://example.com/mcp', 'token': 'synthetic'}
        self.addCleanup(lambda: setattr(Client, 'schemas', {}))

    def test_older_server_is_refused_before_anything_is_sent(self):
        Client.schemas = {}
        with self.assertRaisesRegex(Exception, 'needs an update'):
            self.memory.action(SELECTION['id'], 'prepare', {})
        self.assertEqual(Client.calls, [])

    def test_written_messages_are_reviewed_and_published_as_text(self):
        Client.schemas = TEXT_SCHEMA
        self.memory.action(SELECTION['id'], 'prepare', {})
        question = next(a for n, a in Client.calls if n == 'ask_sera')['question']
        self.assertIn('written WhatsApp messages', question)
        self.assertIn('Messages:\n' + SELECTION['transcript'], question)
        self.assertNotIn('voice transcript', question)
        self.memory.action(SELECTION['id'], 'publish', {})
        publish = next(a for n, a in Client.calls if n == 'publish_voice_memory')
        self.assertEqual((publish['source_kind'], publish['transcript'], publish['source_id']), ('text', SELECTION['transcript'], SELECTION['id']))
        self.assertTrue(self.memory.state(SELECTION['id'])['draft']['verified'])

    def test_voice_notes_keep_the_existing_publish_arguments(self):
        with self.inbox.connect() as db:
            db.execute("INSERT INTO notes(id,sender,chat,timestamp,status,transcript,updated) VALUES('voice','S','C',1,'done','Meet Monday.',0)")
        self.memory.action('voice', 'prepare', {})
        self.memory.action('voice', 'publish', {})
        self.assertNotIn('source_kind', next(a for n, a in Client.calls if n == 'publish_voice_memory'))

    def test_legacy_direct_send_never_publishes_text(self):
        with self.assertRaisesRegex(Exception, 'Open the review'):
            self.memory.send(SELECTION['id'])
        self.assertEqual(Client.calls, [])


if __name__ == '__main__':
    unittest.main()

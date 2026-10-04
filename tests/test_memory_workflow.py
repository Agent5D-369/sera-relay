import json
from pathlib import Path
import tempfile
import unittest
from inbox_store import Inbox
from sera_memory import SeraMemory
from memory_workflow import record_id

PAGE = 'a' * 32
OWNER = 'b' * 32
URL = 'https://www.notion.so/' + PAGE
class Client:
    calls = []
    tools = {'publish_voice_memory'}
    fail_body = False
    def __init__(self, *args): pass
    def start(self): pass
    def close(self): pass
    def call(self, name, args):
        self.calls.append((name, args))
        if name == 'find_voice_memory': return 'null'
        if name == 'ask_sera':
            return json.dumps({'title': 'Weekly meeting proposal', 'summary': 'A proposal, not a decision.',
                'claims': [{'text': 'Meet Monday', 'kind': 'transcript', 'quote': 'meet Monday'},
                           {'text': 'Approved budget', 'kind': 'transcript', 'quote': 'invented quote'},
                           {'text': 'Existing context', 'kind': 'memory', 'url': URL}],
                'actions': [{'title': 'Prepare agenda', 'evidence': 'Suggested follow-up'}],
                'related': [{'title': 'Earlier meeting', 'url': URL}]}) + '\n\nSources:\n- [Earlier meeting](' + URL + ')'
        if name == 'list_voice_task_owners': return json.dumps([{'id': OWNER, 'name': 'Test owner'}])
        if name in ('publish_voice_memory', 'verify_voice_memory', 'repair_voice_memory_body'):
            return json.dumps({'page_id': PAGE, 'url': URL, 'verified': name != 'publish_voice_memory' or not self.fail_body})
        if name == 'create_voice_task': return json.dumps({'url': 'https://www.notion.so/' + 'c' * 32})
        raise AssertionError(name)
class WorkflowTests(unittest.TestCase):
    def setUp(self):
        Client.calls = []; Client.fail_body = False
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.inbox = Inbox(Path(self.temp.name))
        with self.inbox.connect() as db:
            db.execute("INSERT INTO notes(id,sender,chat,timestamp,status,transcript,updated) VALUES('voice','Speaker','Chat',1791044400,'done','We should meet Monday.',0)")
        self.memory = SeraMemory(self.inbox, Client)
        self.memory.credentials = lambda: {'endpoint': 'https://example.com/mcp', 'token': 'synthetic'}
    def prepare(self): self.memory.action('voice', 'prepare', {})
    def test_review_evidence_no_writes_and_original_preserved(self):
        self.prepare(); draft = self.memory.state('voice')['draft']
        self.assertEqual([c['kind'] for c in draft['claims']], ['Speaker claim', 'Sera inference', 'Institutional memory'])
        self.assertFalse(any(n.startswith('publish') for n, _ in Client.calls))
        self.assertEqual(self.inbox.get('voice')['transcript'], 'We should meet Monday.')
    def test_changed_transcript_requires_fresh_preview(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, 'Preview again'): self.memory.action('voice', 'publish', {'transcript': 'Different text'})
        self.assertFalse(any(n == 'publish_voice_memory' for n, _ in Client.calls))
    def test_automatic_title_includes_sender_and_date(self):
        self.prepare()
        self.assertIn(' | Speaker | 2026-10-03', self.memory.state('voice')['draft']['title'])
        self.memory.action('voice', 'prepare', {'title': 'My chosen title'})
        self.assertEqual(self.memory.state('voice')['draft']['title'], 'My chosen title')
    def test_failed_preview_survives_finished_update_and_retry_clears_it(self):
        from unittest.mock import patch
        with patch.object(self.memory.workflow, 'prepare', side_effect=ValueError('Sera returned an invalid preview')):
            with self.assertRaises(ValueError): self.prepare()
        self.assertEqual(self.memory.state('voice')['status'], 'review_error')
        self.assertIn('invalid preview', self.memory.state('voice')['error'])
        self.prepare()
        self.assertEqual(self.memory.state('voice')['status'], 'ready')
        self.assertEqual(self.memory.state('voice')['error'], '')
    def test_publish_exact_breakdown_and_body_repair(self):
        self.prepare(); Client.fail_body = True
        self.memory.action('voice', 'publish', {'title': 'Edited title', 'related_ids': []})
        draft = self.memory.state('voice')['draft']; self.assertTrue(draft['verified'])
        publish = next(a for n, a in Client.calls if n == 'publish_voice_memory')
        self.assertEqual(publish['title'], 'Edited title'); self.assertEqual(publish['breakdown'], draft['breakdown'])
        self.assertEqual(publish['original_transcript'], self.inbox.get('voice')['transcript'])
        self.assertTrue(any(n == 'repair_voice_memory_body' for n, _ in Client.calls))
    def test_tasks_require_selection_owner_date_and_verified_memory(self):
        self.prepare()
        with self.assertRaisesRegex(ValueError, 'Publish'): self.memory.action('voice', 'tasks', {'selection': []})
        self.memory.action('voice', 'publish', {})
        with self.assertRaises(ValueError): self.memory.action('voice', 'tasks', {'selection': [{'index': 0, 'owner_id': 'outsider', 'due_date': '2026-10-10'}]})
        self.assertFalse(any(n == 'create_voice_task' for n, _ in Client.calls))
        self.memory.action('voice', 'tasks', {'selection': [{'index': 0, 'owner_id': OWNER, 'due_date': '2026-10-10'}]})
        self.assertEqual(len(self.memory.state('voice')['draft']['tasks']), 1)
    def test_non_notion_links_are_rejected(self):
        self.assertIsNone(record_id('https://evil.example/' + PAGE))
    def test_multiple_assignees_create_one_shared_task(self):
        self.prepare(); self.memory.action('voice', 'publish', {})
        endpoint = self.memory.credentials()['endpoint']
        draft = self.memory.workflow.get(endpoint, 'voice')
        draft['owners'].append({'id': 'second', 'name': 'Second owner'})
        self.memory.workflow.put(endpoint, 'voice', draft)
        self.memory.action('voice', 'tasks', {'selection': [{'index': 0, 'owner_ids': [OWNER, 'second'], 'due_date': '2026-10-10'}]})
        calls = [a for n, a in Client.calls if n == 'create_voice_task']
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]['owner_ids'], [OWNER, 'second'])
    def test_legacy_send_uses_shared_guard_when_connector_supports_it(self):
        self.memory.send('voice'); self.memory.send('voice')
        self.assertEqual(sum(n == 'publish_voice_memory' for n, _ in Client.calls), 1)
        self.assertFalse(any(n == 'save_document' for n, _ in Client.calls))


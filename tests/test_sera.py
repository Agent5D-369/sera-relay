import json
import io
from unittest.mock import patch
from pathlib import Path
import tempfile
import unittest
from inbox_store import Inbox
from sera_memory import SeraMemory, MemoryError, NotWritten, protect, McpClient, validate_endpoint, read_mcp_response, document_title


class StreamDeadlineTests(unittest.TestCase):
    def test_keepalives_do_not_extend_deadline(self):
        response = io.BytesIO(b': keepalive\n\n' * 10)
        response.headers = {'Content-Type': 'text/event-stream'}
        with patch('sera_memory.time.monotonic', side_effect=[0, 0, 2]):
            with self.assertRaisesRegex(MemoryError, 'too long'):
                read_mcp_response(response, 1, timeout=1)


class FakeClient:
    calls = []
    fail_save = False
    fail_advice = False
    denied = False
    def __init__(self, endpoint, token):
        pass
    def start(self):
        pass
    def close(self):
        pass
    def call(self, tool, arguments):
        self.calls.append((tool, arguments))
        if tool == 'ask_sera' and arguments.get('question', '').startswith('Create a concise Knowledge Base title'):
            return '{"title":"Proposal review and requested follow-up"}'
        if tool == 'save_document':
            if self.denied:
                raise NotWritten('scope denied')
            if self.fail_save:
                raise MemoryError('timeout after write')
            return 'Saved: https://www.notion.so/1234567890abcdef'
        if self.fail_advice:
            raise MemoryError('advice unavailable')
        return 'Review the draft and clarify the request.'


class SeraTests(unittest.TestCase):
    def setUp(self):
        FakeClient.calls = []
        FakeClient.fail_save = FakeClient.fail_advice = False
        FakeClient.denied = False
        self.folder = tempfile.TemporaryDirectory()
        self.inbox = Inbox(Path(self.folder.name))
        self.inbox.ingest({'type': 'incoming', 'id': 'voice', 'sender': 'Sender', 'chat': 'Chat', 'timestamp': 1790985600})
        self.inbox.complete('voice', 'Please review this proposal.')
        self.memory = SeraMemory(self.inbox, FakeClient)
        self.memory.configure('https://memory.example.com/mcp', 'fake-secret-for-tests')
    def tearDown(self):
        self.folder.cleanup()
    def test_save_advice_and_repeat_survive_restart(self):
        self.memory.send('voice')
        self.memory.send('voice')
        memory = SeraMemory(self.inbox, FakeClient)
        memory.send('voice')
        self.assertEqual([call[0] for call in FakeClient.calls], ['ask_sera', 'ask_sera', 'save_document'])
        self.assertIn('Please review', FakeClient.calls[2][1]['key_points'])
        self.assertIn(memory.state('voice')['advice'], FakeClient.calls[2][1]['key_points'])
        self.assertEqual(FakeClient.calls[2][1]['title'], 'Proposal review and requested follow-up | 2026-10-03')
        self.assertNotIn('voice', FakeClient.calls[2][1]['title'])
        self.assertEqual(memory.state('voice')['content_state'], 'complete')
        self.assertEqual(FakeClient.calls[2][1]['status'], 'Published')
        self.assertEqual(memory.state('voice')['status'], 'done')
        self.assertTrue(memory.state('voice')['url'].startswith('https://www.notion.so/'))
    def test_failed_analysis_retries_without_creating_a_partial_document(self):
        FakeClient.fail_advice = True
        with self.assertRaises(MemoryError):
            self.memory.send('voice')
        self.assertEqual(self.memory.state('voice')['status'], 'ready')
        self.assertFalse(any(call[0]=='save_document' for call in FakeClient.calls))
        FakeClient.fail_advice = False
        self.memory.send('voice')
        self.assertEqual(sum(call[0]=='save_document' for call in FakeClient.calls), 1)
    def test_ambiguous_write_never_auto_retries(self):
        FakeClient.fail_save = True
        self.memory.send('voice')
        self.assertEqual(self.memory.state('voice')['status'], 'uncertain')
        SeraMemory(self.inbox, FakeClient).send('voice')
        self.assertEqual(len(FakeClient.calls), 3)

    def test_existing_breakdown_is_saved_once_without_reimporting_source(self):
        with self.inbox.connect() as db:
            db.execute("INSERT INTO memory_receipts(endpoint,id,status,url,advice) VALUES(?,'voice','done',?,?)",
                       ('https://memory.example.com/mcp','https://www.notion.so/original','Previously displayed breakdown with evidence.'))
        self.memory.send('voice')
        SeraMemory(self.inbox, FakeClient).send('voice')
        saves = [args for tool,args in FakeClient.calls if tool=='save_document']
        self.assertEqual(len(saves), 1)
        self.assertEqual(saves[0]['source_url'], 'https://www.notion.so/original')
        self.assertEqual(saves[0]['status'], 'Published')
        self.assertIn('Previously displayed breakdown', saves[0]['key_points'])
        self.assertNotIn('Please review this proposal.', saves[0]['key_points'])
        self.assertEqual(self.memory.state('voice')['url'], 'https://www.notion.so/original')
        self.assertEqual(self.memory.state('voice')['content_state'], 'complete')

    def test_uncertain_analysis_save_never_repeats_after_restart(self):
        with self.inbox.connect() as db:
            db.execute("INSERT INTO memory_receipts(endpoint,id,status,url,advice) VALUES(?,'voice','done',?,?)",
                       ('https://memory.example.com/mcp','https://www.notion.so/original','Existing advice'))
        FakeClient.fail_save = True
        self.memory.send('voice')
        SeraMemory(self.inbox, FakeClient).send('voice')
        self.assertEqual(sum(tool=='save_document' for tool,args in FakeClient.calls), 1)
        self.assertEqual(self.memory.state('voice')['content_state'], 'analysis_uncertain')

    def test_interrupted_analysis_save_is_not_repeated(self):
        with self.inbox.connect() as db:
            db.execute("INSERT INTO memory_receipts(endpoint,id,status,url,advice,content_state) VALUES(?,'voice','done',?,?,'analysis_saving')",
                       ('https://memory.example.com/mcp','https://www.notion.so/original','Existing advice'))
        SeraMemory(self.inbox, FakeClient).send('voice')
        self.assertEqual(FakeClient.calls, [])
        self.assertEqual(self.memory.state('voice')['content_state'], 'analysis_uncertain')
    def test_interrupted_write_recovered_without_resubmission(self):
        with self.inbox.connect() as db:
            db.execute("INSERT INTO memory_receipts(endpoint,id,status) VALUES(?,'voice','saving')", ('https://memory.example.com/mcp',))
        memory = SeraMemory(self.inbox, FakeClient)
        memory.send('voice')
        self.assertEqual(memory.state('voice')['status'], 'uncertain')
        self.assertEqual(FakeClient.calls, [])
    def test_secret_is_encrypted_and_setup_does_not_write_memory(self):
        self.assertNotIn(b'fake-secret', self.memory.credential.read_bytes())
        self.assertEqual(self.memory.credentials()['token'], 'fake-secret-for-tests')
        self.assertEqual(FakeClient.calls, [])
        self.assertEqual(protect(protect(b'secret'), decrypt=True), b'secret')
    def test_endpoint_rejects_embedded_credentials(self):
        for endpoint in ['http://example.com', 'https://example.com/mcp?token=secret', 'https://user:secret@example.com/mcp']:
            with self.assertRaises(MemoryError):
                validate_endpoint(endpoint)
    def test_old_connector_cannot_silently_save_a_draft_when_published_is_requested(self):
        client = McpClient('https://example.com/mcp', 'fake-token')
        client.request = lambda *args, **kwargs: self.fail('A write must not be sent to an unsupported connector')
        with self.assertRaises(NotWritten):
            client.call('save_document', {'title':'Test', 'status':'Published'})
    def test_title_falls_back_to_readable_excerpt_without_blocking_save(self):
        class Unavailable:
            def call(self, *args):
                raise MemoryError('Unavailable')
        self.assertEqual(document_title(Unavailable(), 'So, please review the proposal. Thank you.', '2026-10-02'),
                         'please review the proposal | 2026-10-02')
    def test_title_accepts_json_in_fences_and_rejects_multiline_title(self):
        class Naming:
            def call(self, *args):
                return '```json\n{"title":"Community garden planning and volunteer coordination"}\n```'
        self.assertEqual(document_title(Naming(), 'Source text', '2026-10-02'),
                         'Community garden planning and volunteer coordination | 2026-10-02')
        class BadNaming:
            def call(self, *args):
                return '{"title":"Bad\\nTitle"}'
        self.assertEqual(document_title(BadNaming(), 'Source text', '2026-10-02'), 'Source text | 2026-10-02')
    def test_scope_rejection_can_retry_after_credentials_are_fixed(self):
        FakeClient.denied = True
        with self.assertRaises(NotWritten):
            self.memory.send('voice')
        FakeClient.denied = False
        self.memory.send('voice')
        self.assertEqual(self.memory.state('voice')['status'], 'done')
    def test_mcp_session_headers_and_handshake(self):
        requests = []
        class Response:
            headers = {'Mcp-Session-Id': 'session'}
            def __init__(self, result, identifier):
                self.data = json.dumps({'jsonrpc': '2.0', 'id': identifier, 'result': result}).encode()
            def read(self, maximum):
                return self.data
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
        class Opener:
            def open(self, request, timeout):
                payload = json.loads(request.data)
                requests.append((payload, dict(request.header_items())))
                result = {'protocolVersion': '2025-03-26'} if payload['method'] == 'initialize' else {'tools': [{'name': 'save_document'}, {'name': 'ask_sera'}]}
                return Response(result, payload.get('id'))
        client = McpClient('https://example.com/mcp', 'test-token')
        client.opener = Opener()
        client.start()
        self.assertEqual([x[0]['method'] for x in requests], ['initialize', 'notifications/initialized', 'tools/list'])
        self.assertEqual(requests[-1][1]['Mcp-session-id'], 'session')
        self.assertEqual(requests[-1][1]['Accept'], 'application/json, text/event-stream')

    def test_streamed_handshake_tools_and_advice(self):
        requests = []
        class Response(io.BytesIO):
            def __init__(self, result, identifier, notification=False):
                self.headers = {'Content-Type': 'text/event-stream; charset=utf-8', 'Mcp-Session-Id': 'stream-session'}
                body = b'' if notification else (b': keepalive\r\n\r\nevent: message\r\ndata: ' + json.dumps({'jsonrpc':'2.0', 'method':'notifications/progress'}).encode() + b'\r\n\r\nevent: message\r\ndata: ' + json.dumps({'jsonrpc':'2.0', 'id':identifier, 'result':result}).encode() + b'\r\n\r\n')
                super().__init__(body)
            def read(self, *args):
                raise AssertionError('Streaming response must not wait for the whole body')
        class Opener:
            def open(self, request, timeout):
                payload = json.loads(request.data)
                requests.append(payload)
                result = {'protocolVersion': '2025-03-26'} if payload['method'] == 'initialize' else {'tools': [{'name': 'save_document'}, {'name': 'ask_sera'}]} if payload['method'] == 'tools/list' else {'content': [{'type':'text','text':'Advice from Sera'}]}
                return Response(result, payload.get('id'), payload['method']=='notifications/initialized')
        client = McpClient('https://example.com/mcp', 'fake-token')
        client.opener = Opener()
        client.start()
        self.assertEqual(client.call('ask_sera', {'question':'Test'}), 'Advice from Sera')
        self.assertEqual(client.session, 'stream-session')

    def test_stream_ignores_unrelated_ids_and_handles_multiline_data(self):
        response = io.BytesIO(b'data: {"id":9,"result":{}}\n\ndata: {"id":1,\ndata: "result":{"ok":true}}\n\n')
        response.headers = {'Content-Type':'text/event-stream'}
        self.assertEqual(read_mcp_response(response, 1)['result'], {'ok':True})

    def test_unconfirmed_stream_is_rejected(self):
        response = io.BytesIO(b': keepalive\n\n')
        response.headers = {'Content-Type':'text/event-stream'}
        with self.assertRaises(MemoryError):
            read_mcp_response(response, 1)


if __name__ == '__main__':
    unittest.main()

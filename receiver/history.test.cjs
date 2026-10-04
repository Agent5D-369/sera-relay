const { test } = require('node:test');
const assert = require('node:assert/strict');
const { History } = require('./history.cjs');

test('history imports old received and sent voice notes and skips durable completed IDs', async () => {
  const events = [];
  const downloads = [];
  let options;
  const messages = [
    { type: 'ptt', timestamp: 1, fromMe: false, id: { _serialized: 'old-received' } },
    { type: 'ptt', timestamp: 1, fromMe: true, id: { _serialized: 'old-sent' } },
    { type: 'ptt', timestamp: 1, fromMe: false, id: { _serialized: 'already-done' } },
    { type: 'chat', timestamp: 1, fromMe: false, id: { _serialized: 'text' } },
  ];
  const client = { getChatById: async id => {
    assert.equal(id, 'chosen-chat');
    return { fetchMessages: async search => { options = search; return messages; } };
  } };
  const incoming = { receive: async (message, force) => {
    assert.equal(force, true);
    downloads.push(message.id._serialized);
    return true;
  } };
  const history = new History(client, incoming, event => events.push(event));
  await history.load({ chat: 'chosen-chat', limit: 200, skip: ['already-done'] });
  assert.deepEqual(options, { limit: 200 });
  assert.deepEqual(downloads, ['old-received','old-sent']);
  assert.deepEqual(events.at(-1), { type: 'history_done', scanned: 4, found: 3, downloaded: 2, skipped: 1, failed: 0 });
  assert.equal(history.busy, false);
});

test('history validates limits and exposes retrieval failures', async () => {
  const events = [];
  const history = new History({ getChatById: async () => { throw new Error('unavailable'); } }, {}, event => events.push(event));
  await history.load({ chat: 'chat', limit: 999999 });
  assert.equal(events.at(-1).type, 'history_error');
  await history.load({ chat: 'chat', limit: 1000 });
  assert.equal(events.at(-1).type, 'history_error');
  assert.equal(history.busy, false);
});

test('chat list is sorted by recent activity and excludes read-only channels', async () => {
  const events = [];
  const history = new History({ getChats: async () => [
    { id: { _serialized: 'older' }, name: 'Older chat', timestamp: 1 },
    { id: { _serialized: 'channel' }, name: 'Channel', timestamp: 3, isReadOnly: true },
    { id: { _serialized: 'recent' }, name: 'Recent chat', timestamp: 2, isGroup: true },
  ] }, {}, event => events.push(event));
  await history.chats();
  assert.deepEqual(events[0].chats.map(chat => chat.id), ['recent', 'older']);
});

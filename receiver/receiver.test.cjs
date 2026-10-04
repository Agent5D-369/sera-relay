const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Incoming } = require('./incoming.cjs');

test('received voice note downloads without playback and duplicate events are ignored', async () => {
  const spool = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-receiver-test-'));
  const events = [];
  let downloads = 0;
  const message = { id: { _serialized: 'received-voice-1' }, type: 'ptt', timestamp: 100,
    fromMe: false, from: 'chat-id', author: 'sender-id',
    downloadMedia: async () => { downloads++; return { mimetype: 'audio/ogg', data: Buffer.from('audio bytes').toString('base64') }; },
    getContact: async () => ({ pushname: 'Test Sender' }), getChat: async () => ({ name: 'Test Chat' }) };
  try {
    const incoming = new Incoming(spool, event => events.push(event), 100);
    await Promise.all([incoming.receive(message), incoming.receive(message)]);
    await incoming.receive(message);
    assert.equal(downloads, 1);
    assert.deepEqual(events.map(event => event.type), ['incoming', 'media']);
    assert.equal(events[1].sender, 'Test Sender');
    assert.equal(await fs.readFile(events[1].path, 'utf8'), 'audio bytes');
    assert.equal(JSON.parse(await fs.readFile(events[1].path + '.json', 'utf8')).id, message.id._serialized);
    for (const excluded of [{ isStatus: true }, { type: 'chat' }, { timestamp: 1 }]) {
      await incoming.receive({ ...message, id: { _serialized: JSON.stringify(excluded) }, ...excluded });
    }
    assert.equal(downloads, 1);
    await incoming.receive({...message,fromMe:true,to:'destination',id:{_serialized:'sent-voice'}});
    assert.equal(downloads,2);
    assert.equal(events.at(-1).id,'sent-voice');
  } finally { await fs.rm(spool, { recursive: true, force: true }); }
});

test('failed download is visible and a later retry succeeds', async () => {
  const spool = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-receiver-test-'));
  const events = [];
  const incoming = new Incoming(spool, event => events.push(event), 100);
  const message = { id: { _serialized: 'failure' }, type: 'ptt', timestamp: 100, fromMe: false,
    from: 'chat', downloadMedia: async () => ({ mimetype: 'video/mp4', data: 'AAAA' }) };
  try {
    await incoming.receive(message);
    assert.equal(events.at(-1).type, 'download_error');
    message.downloadMedia = async () => ({ mimetype: 'audio/ogg', data: 'AAAA' });
    await incoming.receive(message, true);
    assert.equal(events.at(-1).type, 'media');
  } finally { await fs.rm(spool, { recursive: true, force: true }); }
});


test('record links allow only HTTPS Notion hosts without embedded credentials', () => {
  const { allowedRecord } = require('./external.cjs');
  assert.equal(allowedRecord('https://www.notion.so/test'), true);
  assert.equal(allowedRecord('https://app.notion.com/p/test'), true);
  for (const url of ['http://notion.so/test','https://notion.so.evil.com/test','javascript:alert(1)','https://user:password@notion.so/test']) assert.equal(allowedRecord(url),false);
});

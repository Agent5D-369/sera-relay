'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TextCapture, InboxWatch, compose, textOf, itemId } = require('./text.cjs');

const message = (id, extra = {}) => ({ id: { _serialized: id }, type: 'chat', body: 'Text ' + id, timestamp: 1791044400, from: 'group@g.us', to: 'me@c.us',
  author: 'ana@c.us', fromMe: false, isForwarded: false, getContact: async () => ({ pushname: 'Ana' }), getChat: async () => ({ name: 'Garden circle' }), ...extra });

test('only written content is captured', () => {
  assert.equal(textOf(message('a')), 'Text a');
  assert.equal(textOf(message('a', { type: 'ptt', body: '' })), '');
  assert.equal(textOf(message('a', { type: 'image', body: 'Seedlings' })), '(photo caption) Seedlings');
  assert.equal(textOf(message('a', { type: 'image', body: '' })), '');
  assert.equal(textOf(message('a', { isStatus: true })), '');
  assert.equal(textOf(message('a', { type: 'chat', body: '   ' })), '');
});

test('a selection has one stable identity regardless of order', () => {
  assert.equal(itemId(['b', 'a']), itemId(['a', 'b', 'a']));
  assert.notEqual(itemId(['a']), itemId(['a', 'b']));
  assert.match(itemId(['a']), /^text_[0-9a-f]{40}$/);
});

test('messages are ordered by time and forwarding is stated, not guessed', () => {
  const event = compose([
    { id: 'm2', timestamp: 200, sender: 'Bea', text: 'Monday works.', forwarded: true },
    { id: 'm1', timestamp: 100, sender: 'Ana', text: 'Meet Monday?', forwarded: false },
  ], 'Garden circle');
  assert.deepEqual(event.sources, ['m1', 'm2']);
  assert.equal(event.timestamp, 100);
  assert.equal(event.sender, 'Ana, Bea');
  const lines = event.transcript.split('\n');
  assert.match(lines[0], /^\[\d{4}-\d\d-\d\d \d\d:\d\d\] Ana: Meet Monday\?$/);
  assert.match(lines[1], /Bea \(forwarded; WhatsApp does not show the original author\): Monday works\.$/);
  assert.throws(() => compose([], 'x'), /at least one/);
  assert.throws(() => compose([{ id: 'a', timestamp: 1, sender: 'A', text: 'x'.repeat(100001) }], 'x'), /too long/);
  assert.equal(compose(['A', 'B', 'C', 'D', 'E'].map((s, i) => ({ id: s, timestamp: i, sender: s, text: 't' })), 'x').sender, 'A, B, C and 2 others');
});

test('capture reads text from the linked session and skips what is not text', async () => {
  const store = { m1: message('m1'), m2: message('m2', { fromMe: true, getContact: async () => ({ pushname: 'Rick' }) }), voice: message('voice', { type: 'ptt', body: '' }) };
  const events = [];
  const capture = new TextCapture({ getMessageById: async id => store[id] || null }, e => events.push(e));
  const id = await capture.capture(['m1', 'm2', 'voice', 'gone']);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, id);
  assert.deepEqual(events[0].sources, ['m1', 'm2']);
  assert.equal(events[0].chat, 'Garden circle');
  assert.match(events[0].transcript, /Ana: Text m1\n.*Rick: Text m2$/);
  await assert.rejects(capture.capture(['voice']), /None of the selected messages/);
  await assert.rejects(capture.capture([]), /between 1 and 100/);
  await assert.rejects(capture.capture(Array(101).fill('m1')), /between 1 and 100/);
});

test('the inbox watch only reports new written messages in the chosen chat', async () => {
  const events = [];
  const old = message('old', { timestamp: 10 }), fresh = message('fresh', { timestamp: 100 });
  const mine = message('mine', { timestamp: 100, fromMe: true, from: 'me@c.us', to: 'group@g.us' });
  const elsewhere = message('else', { timestamp: 100, from: 'other@c.us' }), voice = message('voice', { type: 'ptt', body: '', timestamp: 100 });
  const watch = new InboxWatch({ getChatById: async () => ({ fetchMessages: async () => [old, fresh, mine, elsewhere, voice] }) }, e => events.push(e));
  assert.equal(watch.consider(fresh), false);
  watch.set('group@g.us', 50);
  await watch.scan();
  assert.deepEqual(events.map(e => e.id), ['fresh', 'mine']);
  assert.ok(events.every(e => e.type === 'inbox_message' && e.chat === 'group@g.us'));
});

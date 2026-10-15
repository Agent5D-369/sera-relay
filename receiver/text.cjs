'use strict';
const { createHash } = require('node:crypto');

const LIMIT = 100;
const MAX_CHARS = 100000;
const CAPTIONED = { image: 'photo', video: 'video', document: 'document' };

// Written content only: plain messages, plus the caption a person typed under a photo, video or file.
function textOf(message) {
  if (!message || message.isStatus) return '';
  const body = typeof message.body === 'string' ? message.body.trim() : '';
  if (message.type === 'chat') return body;
  if (CAPTIONED[message.type] && body) return `(${CAPTIONED[message.type]} caption) ${body}`;
  return '';
}
// The same selection always produces the same item, so a repeated capture reopens it.
function itemId(ids) {
  return 'text_' + createHash('sha256').update([...new Set(ids)].sort().join('\n')).digest('hex').slice(0, 40);
}
function stamp(seconds) {
  const date = new Date(seconds * 1000), pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function senders(names) {
  const unique = [...new Set(names)];
  return unique.length <= 3 ? unique.join(', ') : `${unique.slice(0, 3).join(', ')} and ${unique.length - 3} others`;
}
// entries: [{ id, timestamp, sender, text, forwarded }] in any order.
function compose(entries, chat) {
  if (!entries.length) throw new Error('Select at least one written message.');
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  const transcript = sorted.map(e => `[${stamp(e.timestamp)}] ${e.sender}` +
    (e.forwarded ? ' (forwarded; WhatsApp does not show the original author)' : '') + ': ' + e.text).join('\n');
  if (transcript.length > MAX_CHARS) throw new Error('This selection is too long. Select fewer messages.');
  const sources = sorted.map(e => e.id);
  return { type: 'text_capture', id: itemId(sources), sender: senders(sorted.map(e => e.sender)), chat,
    timestamp: sorted[0].timestamp, transcript, sources };
}

class TextCapture {
  constructor(client, emit) {
    this.client = client;
    this.emit = emit;
  }
  // Reads the selected messages from the linked session, never from the page, so the saved text is exactly WhatsApp's.
  async capture(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > LIMIT || ids.some(id => typeof id !== 'string' || !id || id.length > 1024)) {
      throw new Error(`Select between 1 and ${LIMIT} messages.`);
    }
    const entries = [], names = new Map();
    let chat = '';
    for (const id of new Set(ids)) {
      const message = await this.client.getMessageById(id);
      const text = textOf(message);
      if (!text) continue;
      const author = message.fromMe ? 'me' : (message.author || message.from);
      if (!names.has(author)) {
        let name = message.fromMe ? 'Me' : author;
        try {
          const contact = await message.getContact();
          name = message.fromMe ? (contact.pushname || 'Me') : (contact.pushname || contact.name || contact.number || author);
        } catch { /* The ID still identifies the sender. */ }
        names.set(author, name);
      }
      if (!chat) {
        try { chat = (await message.getChat()).name || ''; } catch { /* Fall back below. */ }
        chat = chat || (message.fromMe ? message.to : message.from);
      }
      entries.push({ id, timestamp: message.timestamp, sender: names.get(author), text, forwarded: !!message.isForwarded });
    }
    if (!entries.length) throw new Error('None of the selected messages are available as text. Reload the chat and try again.');
    const event = compose(entries, chat || 'WhatsApp');
    this.emit(event);
    return event.id;
  }
}

// Watches one chat that people forward messages into. Read-only: it records which messages arrived, never replies.
class InboxWatch {
  constructor(client, emit) {
    this.client = client;
    this.emit = emit;
    this.chat = '';
    this.since = 0;
  }
  set(chat, since) {
    this.chat = typeof chat === 'string' ? chat : '';
    this.since = Number.isFinite(since) ? since : 0;
  }
  consider(message) {
    if (!this.chat || !message || message.timestamp < this.since || !textOf(message)) return false;
    const chat = message.fromMe ? message.to : message.from;
    const id = message.id?._serialized;
    if (chat !== this.chat || !id) return false;
    this.emit({ type: 'inbox_message', id, chat, timestamp: message.timestamp });
    return true;
  }
  // Catches messages that arrived while the app was closed.
  async scan() {
    if (!this.chat) return;
    try {
      const chat = await this.client.getChatById(this.chat);
      for (const message of await chat.fetchMessages({ limit: 500 })) this.consider(message);
    } catch { /* The inbox count is a convenience; opening the chat still shows every message. */ }
  }
}
module.exports = { TextCapture, InboxWatch, compose, textOf, itemId, LIMIT };

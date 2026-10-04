'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

class Incoming {
  constructor(spool, emit, startedAt = Math.floor(Date.now() / 1000)) {
    this.spool = spool;
    this.emit = emit;
    this.startedAt = startedAt;
    this.pending = new Set();
    this.handled = new Set();
  }
  async receive(message, force = false) {
    if (message.isStatus || message.type !== 'ptt') return false;
    if (!force && message.timestamp < this.startedAt - 2) return false;
    const id = message.id?._serialized;
    if (!id || this.pending.has(id) || (!force && this.handled.has(id))) return false;
    this.pending.add(id);
    const metadata = { id, sender: message.author || message.from, chat: message.fromMe ? message.to : message.from,
      timestamp: message.timestamp };
    this.emit({ type: 'incoming', ...metadata });
    try {
      let media;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { media = await message.downloadMedia(); } catch (error) {
          if (attempt === 2) throw error;
        }
        if (media?.data) break;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
      }
      if (!media?.data) throw new Error('The voice note is not available for download.');
      if (!media.mimetype?.startsWith('audio/')) throw new Error('The received file is not audio.');
      const bytes = Buffer.from(media.data, 'base64');
      if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error('The voice note is empty or exceeds 50 MB.');
      await fs.mkdir(this.spool, { recursive: true });
      const filename = createHash('sha256').update(id).digest('hex') + '.audio';
      const file = path.join(this.spool, filename);
      await fs.writeFile(file + '.tmp', bytes, { mode: 0o600 });
      await fs.rename(file + '.tmp', file);
      try {
        const [contact, chat] = await Promise.all([message.getContact(), message.getChat()]);
        metadata.sender = contact.pushname || contact.name || contact.number || metadata.sender;
        metadata.chat = chat.name || metadata.chat;
      } catch { /* IDs still identify the note when names are unavailable. */ }
      const event = { type: 'media', ...metadata, path: file };
      // A receipt recovers a completed download if the local window exits before ingest.
      await fs.writeFile(file + '.json.tmp', JSON.stringify(event), { mode: 0o600 });
      await fs.rename(file + '.json.tmp', file + '.json');
      this.handled.add(id);
      // Bound runtime deduplication; durable deduplication lives in the local database.
      if (this.handled.size > 10000) this.handled.delete(this.handled.values().next().value);
      this.emit(event);
      return true;
    } catch {
      this.emit({ type: 'download_error', ...metadata,
        error: 'Voice note download failed. Reconnect if needed, then select Retry.' });
      return false;
    } finally {
      this.pending.delete(id);
    }
  }
}
module.exports = { Incoming };

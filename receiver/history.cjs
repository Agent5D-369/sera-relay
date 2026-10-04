'use strict';

class History {
  constructor(client, incoming, emit) {
    this.client = client;
    this.incoming = incoming;
    this.emit = emit;
    this.busy = false;
  }
  async chats() {
    try {
      const chats = await this.client.getChats();
      this.emit({ type: 'history_chats', chats: chats
        .filter(chat => !chat.isReadOnly && chat.id?._serialized && chat.id._serialized !== 'status@broadcast')
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .map(chat => ({ id: chat.id._serialized, name: chat.name || chat.id._serialized, group: !!chat.isGroup })) });
    } catch (error) {
      this.emit({ type: 'history_error', error: 'Could not load chats. Reconnect and try again.', detail: String(error).slice(0, 300) });
    }
  }
  async load(command) {
    if (this.busy) {
      this.emit({ type: 'history_error', error: 'A history import is already running. Wait for it to finish.' });
      return;
    }
    if (typeof command.chat !== 'string' || !command.chat || ![200, 1000, 5000].includes(command.limit)) {
      this.emit({ type: 'history_error', error: 'Choose a chat and a valid message range.' });
      return;
    }
    this.busy = true;
    try {
      this.emit({ type: 'history_progress', status: 'Loading received messages from this chat...' });
      const chat = await this.client.getChatById(command.chat);
      const messages = await chat.fetchMessages({ limit: command.limit });
      const skip = new Set(Array.isArray(command.skip) ? command.skip : []);
      const voices = messages.filter(message => message.type === 'ptt' && !message.isStatus);
      let downloaded = 0;
      let skipped = 0;
      for (const [index, message] of voices.entries()) {
        if (skip.has(message.id?._serialized)) {
          skipped++;
          continue;
        }
        this.emit({ type: 'history_progress', status: `Downloading older voice note ${index + 1} of ${voices.length}...` });
        if (await this.incoming.receive(message, true)) downloaded++;
      }
      this.emit({ type: 'history_done', scanned: messages.length, found: voices.length,
        downloaded, skipped, failed: voices.length - downloaded - skipped });
    } catch {
      this.emit({ type: 'history_error', error: 'Could not load this chat history. Some older messages may not be synced to the linked device.' });
    } finally {
      this.busy = false;
    }
  }
}
module.exports = { History };

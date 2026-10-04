'use strict';
const { installMediaCompatibility } = require('./media-compat.cjs');

// Read-only compatibility with WhatsApp's renamed serialized ID field.
// Keep chat retrieval independent of optional group/newsletter metadata refreshes.
function installPageCompatibility() {
  const api = window.WWebJS;
  if (api.__voiceCompatibility) return;
  const serialized = id => {
    if (typeof id === 'string') return id;
    if (!id) return undefined;
    if (typeof id._serialized === 'string') return id._serialized;
    if (typeof id.$1 === 'string') return id.$1;
    if (typeof id.user === 'string' && typeof id.server === 'string') return `${id.user}@${id.server}`;
    return undefined;
  };
  const idModel = (id, original) => {
    const value = serialized(id) || serialized(original);
    return typeof id === 'object' && id ? { ...id, _serialized: value } : { _serialized: value };
  };
  const originalMessage = api.getMessageModel;
  api.getMessageModel = message => {
    const model = originalMessage(message);
    model.id = idModel(model.id, message.id);
    model.id.remote = serialized(message.id?.remote) || serialized(model.id.remote);
    for (const key of ['from', 'to', 'author']) {
      if (typeof model[key] === 'object' && model[key]) model[key] = serialized(model[key]);
    }
    return model;
  };
  api.getChatModel = async chat => {
    if (!chat) return null;
    let model;
    try { model = chat.serialize(); } catch { model = {}; }
    model.id = idModel(model.id, chat.id);
    model.formattedTitle = chat.formattedTitle || model.formattedTitle || model.name || model.id._serialized;
    model.isGroup = !!chat.groupMetadata || model.id._serialized?.endsWith('@g.us');
    model.isMuted = !!chat.mute?.expiration;
    // Announcement groups still contain received voice notes, so they remain selectable.
    model.isReadOnly = false;
    model.t = model.t || chat.t || 0;
    model.lastMessage = null;
    if (model.isGroup) {
      try { model.groupMetadata = chat.groupMetadata.serialize(); } catch { model.groupMetadata = {}; }
    }
    delete model.msgs;
    return model;
  };
  api.getChats = async () => {
    const chats = window.require('WAWebCollections').Chat.getModelsArray();
    const result = await Promise.allSettled(chats.map(chat => api.getChatModel(chat)));
    return result.filter(row => row.status === 'fulfilled' && row.value?.id?._serialized).map(row => row.value);
  };
  api.__voiceCompatibility = true;
}

async function installCompatibility(client) {
  await client.pupPage.evaluate(installPageCompatibility);
  await client.pupPage.evaluate(installMediaCompatibility);
}
module.exports = { installCompatibility, installPageCompatibility };

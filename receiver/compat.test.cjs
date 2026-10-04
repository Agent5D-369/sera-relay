const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installPageCompatibility } = require('./compat.cjs');

test('renamed IDs survive serialization and broken metadata does not break other chats', async () => {
  const previous = global.window;
  const chats = [
    { id: { $1: 'person@lid' }, formattedTitle: 'Test person', t: 2, serialize: () => ({ id: { $1: 'person@lid' } }) },
    { id: { $1: 'group@g.us' }, formattedTitle: 'Test group', t: 1,
      serialize: () => { throw new Error('optional serializer failed'); },
      groupMetadata: { serialize: () => { throw new Error('metadata unavailable'); } } },
  ];
  global.window = {
    require: name => { assert.equal(name, 'WAWebCollections'); return { Chat: { getModelsArray: () => chats } }; },
    WWebJS: { getMessageModel: message => ({ id: { ...message.id, remote: undefined },
                                           from: { $1: 'person@lid' }, to: 'self@lid' }) },
  };
  try {
    installPageCompatibility();
    const result = await window.WWebJS.getChats();
    assert.equal(result.length, 2);
    assert.equal(result[0].id._serialized, 'person@lid');
    assert.equal(result[1].id._serialized, 'group@g.us');
    assert.equal(result[1].isGroup, true);
    const message = window.WWebJS.getMessageModel({ id: { $1: 'false_person@lid_msg', remote: { $1: 'person@lid' } } });
    assert.equal(message.id._serialized, 'false_person@lid_msg');
    assert.equal(message.id.remote, 'person@lid');
    assert.equal(message.from, 'person@lid');
    const wrapped = window.WWebJS.getMessageModel;
    installPageCompatibility();
    assert.equal(window.WWebJS.getMessageModel, wrapped);
  } finally { global.window = previous; }
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { installMediaCompatibility } = require('./media-compat.cjs');
test('voice-note decryption receives the declared MIME type while other media remains unchanged', async () => {
  const calls = [];
  const manager = { async downloadAndMaybeDecrypt(options) {
    calls.push(options);
    if (options.type === 'ptt' && !options.mimetype) throw new Error('InvalidMediaFileType');
    return new Uint8Array([79, 103, 103, 83]);
  } };
  global.window = { require(name) {
    if (name === 'WAWebDownloadManager') return { downloadManager: manager };
    return { Msg: { getModelsArray: () => [{ type: 'ptt', filehash: 'voice', mimetype: 'audio/ogg; codecs=opus' }] } };
  } };
  try {
    installMediaCompatibility(); installMediaCompatibility();
    const voice = { type: 'ptt', filehash: 'voice' };
    assert.equal((await manager.downloadAndMaybeDecrypt(voice)).length, 4);
    assert.equal(calls[0].mimetype, 'audio/ogg; codecs=opus');
    assert.equal(voice.mimetype, undefined);
    const image = { type: 'image', filehash: 'image' };
    await manager.downloadAndMaybeDecrypt(image);
    assert.equal(calls[1], image);
  } finally { delete global.window; }
});

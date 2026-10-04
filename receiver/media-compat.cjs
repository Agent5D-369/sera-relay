'use strict';
function installMediaCompatibility() {
  const manager = window.require('WAWebDownloadManager').downloadManager;
  if (manager.__voiceMimeCompatibility) return;
  const download = manager.downloadAndMaybeDecrypt;
  manager.downloadAndMaybeDecrypt = function (options) {
    if (options.type === 'ptt' && !options.mimetype) {
      const msg = window.require('WAWebCollections').Msg.getModelsArray()
        .find(msg => msg.type === 'ptt' && msg.filehash === options.filehash);
      options = { ...options, mimetype: msg?.mimetype || 'audio/ogg' };
    }
    return download.call(this, options);
  };
  manager.__voiceMimeCompatibility = true;
}
module.exports = { installMediaCompatibility };

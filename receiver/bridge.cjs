'use strict';
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { Incoming } = require('./incoming.cjs');
const { History } = require('./history.cjs');
const { installCompatibility } = require('./compat.cjs');
const { installInline } = require('./inline.cjs');
const { showWindow } = require('./window.cjs');
const { startExternal } = require('./external.cjs');
let external;
const inline = process.env.WA_TRANSCRIBER_INLINE === '1';

const home = process.env.WA_TRANSCRIBER_DATA;
if (!home || !path.isAbsolute(home)) throw new Error('A local application data directory is required.');
const emit = event => process.stdout.write(JSON.stringify(event) + '\n');
const browser = [
  path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
].find(file => fs.existsSync(file));
if (!browser) throw new Error('Install Chrome or Edge to connect WhatsApp.');
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'voice-transcriber', dataPath: path.join(home, 'auth') }),
  userAgent: false,
  webVersionCache: { type: 'none' },
  puppeteer: { executablePath: browser, headless: !inline,
    ...(inline ? { args: ['--app=https://web.whatsapp.com/', '--window-size=1150,850'], defaultViewport: null } : {}) },
});
// Preserve the library's cache behavior, but contain cache-only response failures.
const initCache = client.initWebVersionCache.bind(client);
client.initWebVersionCache = async () => {
  const page = client.pupPage;
  const originalOn = page.on;
  page.on = function (name, listener) {
    if (name === 'response') {
      return originalOn.call(this, name, (...args) => {
        Promise.resolve().then(() => listener(...args)).catch(() => {});
      });
    }
    return originalOn.call(this, name, listener);
  };
  try { await initCache(); } finally { page.on = originalOn; }
};
const inject = client.inject.bind(client);
client.inject = async () => {
  if (inline) await showWindow(client.pupBrowser);
  for (let attempt = 0; ; attempt++) {
    try {
      // Debug.VERSION is available before WhatsApp has initialized its stores.
      // Wait for the actual login or inbox screen before loading internal modules.
      await client.pupPage.waitForFunction(
        () => !!document.querySelector('canvas') || !!document.querySelector('#pane-side'),
        { timeout: 60000 },
      );
      if (!await client.pupPage.evaluate(() => typeof window.onNativeVoiceQR === 'function')) {
        await client.pupPage.exposeFunction('onNativeVoiceQR', qr => emit({ type: 'qr', qr }));
      }
      await client.pupPage.evaluate(() => {
        if (window.__voiceQRObserver) return;
        let last;
        const refresh = () => {
          const qr = document.querySelector('[data-ref]')?.getAttribute('data-ref');
          if (qr && qr !== last) {
            last = qr;
            void window.onNativeVoiceQR(qr).catch(() => {});
          }
        };
        window.__voiceQRObserver = new MutationObserver(refresh);
        window.__voiceQRObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ref'] });
        refresh();
      });
      await inject();
      // A restored session may have synced before the library registered its hook.
      await client.pupPage.evaluate(async () => {
        if (window.require('WAWebSocketModel').Socket.hasSynced && !window.WWebJS) {
          await window.onAppStateHasSyncedEvent();
        }
      });
      return;
    } catch (error) {
      if (closing || attempt >= 3 || !/Execution context was destroyed|Cannot find context/.test(String(error))) throw error;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
};
const incoming = new Incoming(path.join(home, 'spool'), emit);
const history = new History(client, incoming, emit);
// The library's reconstructed QR can contain a stale Conn.ref. The DOM observer
// above forwards WhatsApp's actual QR instead, including every refresh.
client.on('authenticated', () => emit({ type: 'status', status: 'Linked. Syncing WhatsApp...' }));
client.on('ready', async () => {
  try {
    await installCompatibility(client);
    if (inline) {
      if (!external) {
        const session = await client.pupBrowser.target().createCDPSession();
        try { const info = await session.send('SystemInfo.getProcessInfo'); external = startExternal(info.processInfo.find(p=>p.type==='browser').id); }
        finally { await session.detach(); }
      }
      await installInline(client, emit, url=>external.open(url));
      await showWindow(client.pupBrowser);
      client.pupBrowser.once('disconnected', () => { emit({ type: 'window_closed' }); void shutdown(); });
    }
    emit({ type: 'ready' });
  } catch {
    emit({ type: 'status', status: 'WhatsApp compatibility setup failed. Select Reconnect.' });
  }
});
client.on('auth_failure', () => emit({ type: 'status', status: 'Linking failed. Reconnect and scan the new QR code.' }));
client.on('disconnected', () => emit({ type: 'status', status: 'WhatsApp disconnected. Select Reconnect.' }));
client.on('message', message => { void incoming.receive(message); });
client.on('message_create', message => { if (message.fromMe) void incoming.receive(message); });

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(0), 7000);
  external?.close();
  try { await client.destroy(); } catch { /* The browser may already be closed. */ }
  clearTimeout(deadline);
  process.exit(0);
}
readline.createInterface({ input: process.stdin }).on('line', async line => {
  try {
    const command = JSON.parse(line);
    if (command.type === 'inline_states' && inline && Array.isArray(command.entries)) {
      await client.pupPage.evaluate(entries => window.VoiceTranscriber?.update(entries), command.entries);
      return;
    }
    if (command.type === 'inline_summary' && inline && Number.isInteger(command.pending)) {
      await client.pupPage.evaluate(pending => window.VoiceTranscriber?.summary(pending), command.pending);
      return;
    }
    if (command.type === 'inline_download' && inline && typeof command.id === 'string') {
      const message = await client.getMessageById(command.id);
      if (message && message.type === 'ptt') await incoming.receive(message, true);
      else emit({ type: 'download_error', id: command.id, error: 'This voice note is no longer available.' });
      return;
    }
    if (command.type === 'shutdown') return void shutdown();
    if (command.type === 'history_chats') return void history.chats();
    if (command.type === 'history_load') return void history.load(command);
    if (command.type === 'retry' && typeof command.id === 'string') {
      const message = await client.getMessageById(command.id);
      if (message) await incoming.receive(message, true);
      else emit({ type: 'download_error', id: command.id, error: 'This voice note is no longer available in the linked session.' });
    }
  } catch { emit({ type: 'status', status: 'The request failed. Reconnect and try again.' }); }
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.stdin.on('end', shutdown);
async function connect(attempt = 0) {
  try {
    await client.initialize();
  } catch (error) {
    if (!closing && attempt < 2 && /Execution context was destroyed|Cannot find context|Target closed/.test(String(error))) {
      emit({ type: 'status', status: 'WhatsApp is refreshing. Reconnecting...' });
      external?.close();
  try { await client.destroy(); } catch { /* Navigation may have closed the page. */ }
      await new Promise(resolve => setTimeout(resolve, 2500));
      if (!closing) return connect(attempt + 1);
      return;
    }
    emit({ type: 'status', status: 'Could not connect to WhatsApp. Check your connection and select Reconnect.', detail: String(error.stack || error).slice(0, 3000) });
    void shutdown();
  }
}
void connect();

'use strict';
// Screenshot of the note colors and the voice-note rail, using the real inline component and synthetic data.
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('../receiver/node_modules/puppeteer');
const { installReviewUI } = require('../receiver/review-ui.cjs');
const { installPageInline } = require('../receiver/inline.cjs');
const out = path.resolve(__dirname, 'screenshots');
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(f => fs.existsSync(f));
const notes = [
  { i: 3, from: 'Sam Example', time: '9:12', state: { status: '', transcript: '' } },
  { i: 8, from: 'Alex Example', time: '10:40', state: { status: 'done', transcript: 'Could we move the Monday check-in to 9:30 so the school run is easier? Happy to take notes.', memory: { status: 'ready' } } },
  { i: 13, from: 'Sam Example', time: '11:05', state: { status: 'done', transcript: 'The water tank on the north side is full again. No action needed this week.', reviewed: true, memory: { status: 'ready' } } },
  { i: 18, from: 'Alex Example', time: '13:20', state: { status: 'done', transcript: 'Please ask Sam and Alex to prepare a proposed agenda for next week.', memory: { status: 'done', url: 'https://www.notion.so/' + 'a'.repeat(32), content_state: 'complete', error: 'Memory saved. 1 task created.', draft: { verified: true, transcript: 'Please ask Sam and Alex to prepare a proposed agenda for next week.', summary: 'Alex asks Sam and Alex to draft the agenda for next week.' } } } },
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: 720, height: 1290, deviceScaleFactor: 1 });
    for (const n of ['onOpenRecord', 'onSeraConnect', 'onSeraSend', 'onSeraAction', 'onVoiceTranscribe', 'onVoiceLookup', 'onVoiceReviewed']) await page.exposeFunction(n, () => {});
    await page.setContent(`<html lang="en"><meta charset="utf-8"><style>body{margin:0;background:#0b141a;color:#e9edef;font:14px system-ui}
      #main{position:absolute;left:0;right:0;top:0;bottom:0}header{height:56px;display:flex;align-items:center;padding:0 24px;background:#202c33;font-weight:600}
      [data-testid=conversation-panel-messages]{position:absolute;top:56px;bottom:0;left:0;right:0;overflow-y:auto;padding:12px 64px 12px 24px}
      .bubble{max-width:520px;margin:10px 0;padding:8px 12px;border-radius:8px;background:#202c33}.bubble small{display:block;color:#8696a0}
      aside{position:fixed;bottom:8px;left:24px;color:#8696a0;font-size:12px}</style>
      <div id="main"><header>Demo team<span style="margin-left:auto;font-weight:400;font-size:12px;color:#8696a0">Synthetic example data</span></header><div data-testid="conversation-panel-messages"><div id="list"></div></div></div>
      </html>`);
    await page.evaluate(notes => {
      const key = i => ({ id: 'm' + i, fromMe: false, toString: () => 'false_demo_m' + i });
      const voice = new Set(notes.map(n => n.i));
      const msgs = Array.from({ length: 22 }, (_, i) => ({ id: key(i), t: 1790000000 + i * 600, type: voice.has(i) ? 'ptt' : 'chat' }));
      const chat = { active: true, msgs: { getModelsArray: () => msgs, msgLoadState: { noEarlierMsgs: true } } };
      const mods = {
        WAWebCollections: { Chat: { getModelsArray: () => [chat] }, Msg: { get: id => msgs.find(m => m.id.id === id), getModelsArray: () => msgs } },
        WAWebChatMessageSearch: { getSearchContext: ({ msgKey }) => ({ key: msgKey.id }) },
        WAWebCmd: { Cmd: { openChatAt: () => {} } },
        WAWebChatLoadMessages: { loadEarlierMsgs: async () => [] },
      };
      window.require = name => mods[name];
      window.WWebJS = { getMessageModel: m => ({ id: { _serialized: m.id.toString() } }) };
      const list = document.getElementById('list');
      for (const n of notes) {
        const d = document.createElement('div'); d.className = 'bubble'; d.setAttribute('data-id', 'm' + n.i);
        d.innerHTML = '<small>' + n.from + ' \u00b7 ' + n.time + '</small>Voice note \u00b7 0:' + (10 + n.i);
        list.append(d);
      }
    }, notes);
    await page.evaluate(installReviewUI); await page.evaluate(installPageInline);
    await page.evaluate(notes => window.VoiceTranscriber.update(notes.map(n => ({ id: 'false_demo_m' + n.i, ...n.state }))), notes);
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(out, 'note-states.png') });
    console.log('Captured note-states.png with synthetic data.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

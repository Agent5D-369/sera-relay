'use strict';
// Browser check for written-message selection, review, saved marks, and the Sera inbox chat, against a synthetic chat.
const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { installPageInline } = require('./inline.cjs');
const { installReviewUI } = require('./review-ui.cjs');
const chrome = process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined;

(async () => {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const captures = [], dismissed = [], inboxSets = [], lookups = [], actions = [];
    let inboxCleared = 0;
    await page.exposeFunction('onTextCapture', ids => { captures.push(ids); return ids.includes('broken') ? { error: 'None of the selected messages are available as text.' } : { id: 'text_item' }; });
    await page.exposeFunction('onTextDismiss', ids => { dismissed.push(ids); });
    await page.exposeFunction('onTextLookup', ids => { lookups.push(...ids); });
    await page.exposeFunction('onInboxSet', (chat, name) => { inboxSets.push([chat, name]); });
    await page.exposeFunction('onInboxClear', () => { inboxCleared++; });
    await page.exposeFunction('onVoiceLookup', () => {});
    await page.exposeFunction('onVoiceTranscribe', () => {});
    await page.exposeFunction('onSeraConnect', () => {});
    await page.exposeFunction('onSeraAction', (id, action) => { actions.push([id, action]); });
    await page.setContent(`<style>body{margin:0;background:#0b141a;color:#e9edef;font:14px system-ui}#side{position:fixed;left:0;top:0;bottom:0;width:30%;background:#111b21}
      [data-testid="conversation-panel-messages"]{position:fixed;left:30%;right:0;top:60px;bottom:62px;overflow:auto;padding:12px}
      [data-id]{padding:6px 18px}.bubble{display:inline-block;max-width:60%;padding:6px 9px;border-radius:8px;background:#202c33}.out{text-align:right}.out .bubble{background:#005c4b}</style>
      <div id="side"><div id="pane-side"></div></div>
      <div data-testid="conversation-panel-messages">
        <div data-id="t1"><span class="bubble">Can we meet Monday about the water tank?</span></div>
        <div data-id="t2"><span class="bubble">Yes, after the school run.</span></div>
        <div data-id="v1"><span class="bubble">Voice note 0:42</span></div>
        <div data-id="t3" class="out"><span class="bubble">I will bring the quotes.</span></div>
        <div data-id="t4"><span class="bubble">Forwarded: the supplier can deliver Thursday.</span></div>
      </div>`);
    await page.evaluate(() => {
      const msg = (id, type, body, extra = {}) => ({ id: { _serialized: id, id, fromMe: false }, type, body, t: 1791044400, ...extra });
      const msgs = [msg('t1', 'chat', 'Can we meet Monday?'), msg('t2', 'chat', 'Yes.'), msg('v1', 'ptt', ''), msg('t3', 'chat', 'Quotes.'), msg('t4', 'chat', 'Thursday.')];
      const list = { getModelsArray: () => msgs, msgLoadState: { noEarlierMsgs: true } };
      const chat = { id: { _serialized: 'group@g.us' }, name: 'Garden circle', formattedTitle: 'Garden circle', active: true, msgs: list };
      window.__opened = [];
      const modules = {
        WAWebCollections: { Msg: { get: id => msgs.find(m => m.id.id === id), getModelsArray: () => msgs }, Chat: { get: id => (id === 'group@g.us' ? chat : null), getModelsArray: () => [chat] } },
        WAWebCmd: { Cmd: { openChatBottom: async ({ chat }) => { window.__opened.push(chat.id._serialized); } } },
      };
      window.require = name => modules[name];
      window.WWebJS = { getMessageModel: m => ({ id: { _serialized: m.id._serialized } }) };
      window.__bubbleClicks = 0;
      document.querySelector('[data-id=t1] .bubble').addEventListener('click', () => { window.__bubbleClicks++; });
    });
    await page.evaluate(installReviewUI);
    await page.evaluate(installPageInline);
    await page.waitForSelector('.vt-select:not([hidden])');

    // Not selecting: clicks reach WhatsApp untouched, and only text bubbles are looked up.
    await page.click('[data-id=t1] .bubble');
    assert.equal(await page.evaluate(() => window.__bubbleClicks), 1);
    assert.deepEqual([...new Set(lookups)].sort(), ['t1', 't2', 't3', 't4']);
    assert.equal(await page.$eval('[data-id=v1]', e => e.hasAttribute('data-vt-text')), false);

    // Select two messages, then shift-select a range that skips the voice note.
    await page.click('.vt-select button');
    assert.equal(await page.$eval('.vt-select', e => [...e.querySelectorAll('button')].filter(b => !b.hidden).map(b => b.textContent).join('|')), 'Review with Sera|Cancel');
    assert.equal(await page.$eval('.vt-select .vt-primary', b => b.disabled), true);
    await page.click('[data-id=t1] .bubble');
    assert.equal(await page.evaluate(() => window.__bubbleClicks), 1, 'selection clicks do not reach WhatsApp');
    await page.keyboard.down('Shift'); await page.click('[data-id=t3] .bubble'); await page.keyboard.up('Shift');
    assert.equal(await page.$eval('.vt-count', e => e.textContent), '3 messages selected');
    assert.deepEqual(await page.$$eval('.vt-picked', es => es.map(e => e.dataset.id)), ['t1', 't2', 't3']);
    await page.click('[data-id=t2] .bubble');
    assert.equal(await page.$eval('.vt-count', e => e.textContent), '2 messages selected');
    await page.screenshot({ path: path.join('build', 'text-select-1280.png') });

    // Review: the page sends message IDs only, then opens the review once the item arrives.
    await page.click('.vt-select .vt-primary');
    assert.deepEqual(captures[0].sort(), ['t1', 't3']);
    assert.equal(await page.$$eval('.vt-picked', es => es.length), 0);
    await page.evaluate(() => window.VoiceTranscriber.update([{ id: 'text_item', kind: 'text', sources: ['t1', 't3'], status: 'done',
      transcript: '[2026-10-03 09:00] Ana: Can we meet Monday?\n[2026-10-03 09:05] Me: Quotes.', memory: { status: 'ready' } }]));
    await page.waitForSelector('dialog.voice-review[open]');
    assert.equal(await page.$eval('dialog h2', e => e.textContent), 'Review messages');
    assert.equal(await page.$eval('dialog textarea', e => e.getAttribute('aria-label')), 'Messages');
    assert.match(await page.$eval('dialog textarea', e => e.value), /Ana: Can we meet Monday\?/);
    assert.deepEqual(actions.at(-1), ['text_item', 'prepare']);
    await page.click('[aria-label="Close review"]');

    // Saved marks on the source messages reopen the review.
    await page.evaluate(() => window.VoiceTranscriber.update([{ id: 'text_item', kind: 'text', sources: ['t1', 't3'], status: 'done', transcript: 'x',
      memory: { status: 'done', url: 'https://www.notion.so/' + 'a'.repeat(32), content_state: 'complete', draft: { verified: true, title: 'Water tank', transcript: 'x', url: 'https://www.notion.so/' + 'a'.repeat(32), tasks: [] } } }]));
    await page.waitForSelector('[data-id=t3] .vt-text-mark[data-state=saved]');
    assert.equal(await page.$eval('[data-id=t1] .vt-text-mark', e => e.textContent), '\u2713 Saved to Sera');
    assert.equal(await page.$$eval('[data-id=t2] .vt-text-mark', es => es.length), 0);
    await page.click('[data-id=t1] .vt-text-mark');
    await page.waitForSelector('dialog.voice-review[open]');
    assert.equal(await page.$eval('dialog h2', e => e.textContent), 'Saved memory');
    await page.click('[aria-label="Close review"]');

    // A failed capture keeps the selection and explains why.
    await page.click('.vt-select button');
    await page.evaluate(() => { const row = document.querySelector('[data-id=t4]'); row.dataset.vtText = 'broken'; });
    await page.click('[data-id=t4] .bubble');
    await page.click('.vt-select .vt-primary');
    assert.match(await page.$eval('.vt-select small', e => e.textContent), /None of the selected messages/);
    assert.equal(await page.$eval('.vt-count', e => e.textContent), '1 message selected');
    await page.evaluate(() => [...document.querySelectorAll('.vt-select button')].find(b => b.textContent === 'Cancel').click());
    await page.evaluate(() => { document.querySelector('[data-id=t4]').dataset.vtText = 't4'; });

    // Choosing the inbox asks for confirmation that names the consent issue.
    await page.click('.voice-tools summary');
    const useButton = () => page.evaluate(() => [...document.querySelectorAll('.vt-inbox button')].map(b => b.textContent));
    assert.deepEqual(await useButton(), ['Use the open chat as Sera inbox']);
    await page.evaluate(() => document.querySelector('.vt-inbox button').click());
    assert.match(await page.$eval('.vt-inbox small', e => e.textContent), /should know their messages may be saved/);
    assert.deepEqual(await useButton(), ['Confirm: use Garden circle']);
    assert.equal(inboxSets.length, 0);
    await page.evaluate(() => document.querySelector('.vt-inbox button').click());
    assert.deepEqual(inboxSets, [['group@g.us', 'Garden circle']]);

    // With new inbox messages, one click opens the chat with them selected; Mark as handled sends nothing.
    await page.evaluate(() => window.VoiceTranscriber.summary(1, { chat: 'group@g.us', name: 'Garden circle', pending: ['t2', 't4'] }));
    assert.match(await page.$eval('.voice-tools summary', e => e.textContent), /1 to review \u00b7 2 new in inbox/);
    assert.deepEqual(await useButton(), ['Review new inbox messages', 'Stop using as inbox']);
    await page.evaluate(() => document.querySelector('.vt-inbox button').click());
    assert.deepEqual(await page.evaluate(() => window.__opened), ['group@g.us']);
    assert.deepEqual(await page.$$eval('.vt-picked', es => es.map(e => e.dataset.id)), ['t2', 't4']);
    assert.equal(await page.$eval('.vt-select', e => [...e.querySelectorAll('button')].filter(b => !b.hidden).map(b => b.textContent).join('|')), 'Review with Sera|Mark as handled|Cancel');
    await page.setViewport({ width: 375, height: 760 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await new Promise(r => setTimeout(r, 100));
    const box = await page.$eval('.vt-select', e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right }; });
    assert.ok(box.left >= 0 && box.right <= 375, 'selection bar fits a phone-width window');
    await page.screenshot({ path: path.join('build', 'text-inbox-375.png') });
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.evaluate(() => [...document.querySelectorAll('.vt-select button')].find(b => b.textContent === 'Mark as handled').click());
    await new Promise(r => setTimeout(r, 50));
    assert.deepEqual(dismissed, [['t2', 't4']]);
    assert.match(await page.$eval('.vt-select small', e => e.textContent), /2 messages marked as handled\. Nothing was sent to Sera\./);
    assert.equal(captures.length, 2);
    await page.click('.voice-tools summary');
    await page.evaluate(() => [...document.querySelectorAll('.vt-inbox button')].find(b => b.textContent === 'Stop using as inbox').click());
    assert.equal(inboxCleared, 1);

    await page.evaluate(() => window.VoiceTranscriber.dispose());
    assert.equal(await page.$$eval('.vt-select,.vt-text-mark,.voice-tools', es => es.length), 0);
    console.log('PASS: text selection, range select, capture by ID, review wording, saved marks, failed capture, inbox consent, inbox review, mark as handled, phone width.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });

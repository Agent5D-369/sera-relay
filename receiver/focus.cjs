'use strict';
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { showWindow } = require('./window.cjs');
(async () => {
  const lines = fs.readFileSync(path.join(process.argv[2], 'auth/session-voice-transcriber/DevToolsActivePort'), 'utf8').split('\n');
  const browser = await puppeteer.connect({ defaultViewport: null, browserWSEndpoint: 'ws://127.0.0.1:' + lines[0] + lines[1] });
  try {
    const page = (await browser.pages())[0];
    const session = await page.createCDPSession();
    const { windowId, bounds } = await session.send('Browser.getWindowForTarget');
    if (bounds.windowState === 'minimized') await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await page.bringToFront();
    await showWindow(browser);
  } finally { browser.disconnect(); }
})().catch(() => { process.exitCode = 1; });

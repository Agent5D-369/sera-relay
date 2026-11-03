'use strict';
// Real-Chrome check: the warned-about flag is gone and navigator.webdriver is still hidden.
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { quietLaunch } = require('./launch.cjs');
const chrome = process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined;
quietLaunch();
(async () => {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  try {
    const args = browser.process().spawnargs;
    assert.equal(args.some(a => a.includes('AutomationControlled')), false, 'unsupported flag not passed to Chrome');
    const [page] = await browser.pages();
    await page.goto('data:text/html,<p>ok</p>');
    assert.equal(await page.evaluate(() => navigator.webdriver), false, 'navigator.webdriver hidden');
    const second = await browser.newPage();
    await second.goto('data:text/html,<p>ok</p>');
    assert.equal(await second.evaluate(() => navigator.webdriver), false, 'hidden on new pages too');
    console.log('PASS: no unsupported-flag warning, navigator.webdriver hidden on every page.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });

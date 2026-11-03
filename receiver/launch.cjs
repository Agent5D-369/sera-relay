'use strict';
// whatsapp-web.js always adds --disable-blink-features=AutomationControlled to hide navigator.webdriver.
// Chrome shows "You are using an unsupported command-line flag" for it, at the top of the WhatsApp window.
// Drop the flag and hide navigator.webdriver from inside the page instead, which Chrome does not warn about.
const UNSUPPORTED = ['--disable-blink-features=AutomationControlled'];
const HIDE_WEBDRIVER = () => {
  try { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true }); } catch { /* already defined */ }
};

function cleanArgs(args = []) { return args.filter(arg => !UNSUPPORTED.includes(arg)); }

async function hide(page) {
  try { await page.evaluateOnNewDocument(HIDE_WEBDRIVER); } catch { /* page closed before setup */ }
}

// puppeteer's exported launch is a frozen, pre-bound function, so wrap the launcher class it calls into.
// puppeteer is pinned (package.json overrides); verify_launch.cjs fails if this internal path moves.
function quietLaunch(Launcher = require('puppeteer-core/internal/node/BrowserLauncher.js').BrowserLauncher) {
  const proto = Launcher.prototype;
  if (proto.launch.__quiet) return;
  const launch = proto.launch;
  proto.launch = async function (options = {}) {
    const browser = await launch.call(this, { ...options, args: cleanArgs(options.args) });
    browser.on('targetcreated', async target => { if (target.type() === 'page') { const page = await target.page().catch(() => null); if (page) await hide(page); } });
    await Promise.all((await browser.pages()).map(hide));
    return browser;
  };
  proto.launch.__quiet = true;
}

module.exports = { quietLaunch, cleanArgs, HIDE_WEBDRIVER };

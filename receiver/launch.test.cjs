'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { quietLaunch, cleanArgs } = require('./launch.cjs');

test('drops the flag Chrome warns about and keeps the rest', () => {
  assert.deepEqual(cleanArgs(['--app=https://web.whatsapp.com/', '--disable-blink-features=AutomationControlled', '--window-size=1150,850']), ['--app=https://web.whatsapp.com/', '--window-size=1150,850']);
  assert.deepEqual(cleanArgs(undefined), []);
});

test('launch hides navigator.webdriver on existing and new pages', async () => {
  const hidden = [], listeners = {};
  const page = name => ({ name, evaluateOnNewDocument: async () => { hidden.push(name); } });
  const browser = { pages: async () => [page('first')], on: (event, fn) => { listeners[event] = fn; } };
  let seen;
  class Fake { async launch(options) { seen = options; return browser; } }
  quietLaunch(Fake); quietLaunch(Fake);
  assert.equal(await new Fake().launch({ headless: false, args: ['--disable-blink-features=AutomationControlled', '--app=x'] }), browser);
  assert.deepEqual(seen.args, ['--app=x']);
  assert.equal(seen.headless, false);
  await listeners.targetcreated({ type: () => 'page', page: async () => page('second') });
  await listeners.targetcreated({ type: () => 'service_worker', page: async () => null });
  assert.deepEqual(hidden, ['first', 'second']);
});

'use strict';
// Confirms every module the packaged receiver requires is present. Run with the receiver folder as argument.
// A module missing from the package only fails when WhatsApp connects, so the release self-test runs this first.
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(process.argv[2] || __dirname);
const missing = [];
for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.cjs'))) {
  const source = fs.readFileSync(path.join(dir, file), 'utf8');
  // window.require(...) runs inside WhatsApp's page, not in Node, so skip calls preceded by a dot.
  for (const match of source.matchAll(/(?<![.\w])require\('([^']+)'\)/g)) {
    const id = match[1];
    try { require.resolve(id.startsWith('.') ? path.join(dir, id) : id, { paths: [dir] }); }
    catch { missing.push(`${file} -> ${id}`); }
  }
}
if (missing.length) {
  console.error('Missing from the receiver package:\n' + missing.join('\n'));
  process.exit(1);
}
console.log('receiver package complete');

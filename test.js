// node test.js — hits the real APIs and checks manifest sanity.
const assert = require('assert');
const fs = require('fs');
// dictionaryapi.dev 404s without a browser UA; Chrome sends one automatically.
const _f = global.fetch;
global.fetch = (u, o = {}) => _f(u, { ...o, headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130' } });
const { lookup } = require('./lookup.js');

const m = JSON.parse(fs.readFileSync(__dirname + '/manifest.json'));
assert.strictEqual(m.manifest_version, 3);
for (const f of ['background.js', 'content.js', 'content.css', 'popup.html', 'popup.js', 'popup-card.css', 'lookup.js'])
  assert(fs.existsSync(__dirname + '/' + f), 'missing ' + f);

(async () => {
  for (const w of ['run', 'beautiful', 'running']) {
    const d = await lookup(w);
    console.log(w, '|', d.phonetic, '|', d.translation, '|', d.meanings.map(x => x.posVi + ': ' + x.terms.slice(0, 3).join(', ')).join(' ; '), '| audio:', !!d.audio);
    assert(d.translation, 'no translation for ' + w);
  }
  console.log('OK');
})().catch(e => { console.error(e); process.exit(1); });

// Hanging dictionary source must not block the Vietnamese result
(async () => {
  const http = require('http');
  const srv = http.createServer(() => {}).listen(0); // never responds
  const port = srv.address().port;
  const real = global.fetch;
  global.fetch = (u, o) => real(String(u).includes('dictionaryapi.dev') ? `http://127.0.0.1:${port}/` : u, o);
  const t0 = Date.now();
  const d = await lookup('house');
  const ms = Date.now() - t0;
  global.fetch = real; srv.close();
  assert(d.translation && ms < 6000, `hang not bounded: ${ms}ms`);
  console.log(`hanging-source test OK (${ms}ms, "${d.translation}")`);
})();

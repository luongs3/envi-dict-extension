// node test.js — lookup logic against the real Google endpoint + manifest sanity.
const assert = require('assert');
const fs = require('fs');
const { lookup } = require('./lookup.js');

const m = JSON.parse(fs.readFileSync(__dirname + '/manifest.json'));
assert.strictEqual(m.manifest_version, 3);
assert(m.permissions.includes('offscreen'), 'offscreen permission missing');
for (const f of ['background.js', 'content.js', 'content.css', 'popup.html', 'popup.js', 'popup-card.css',
  'lookup.js', 'offscreen.html', 'offscreen.js', 'ipa.json'])
  assert(fs.existsSync(__dirname + '/' + f), 'missing ' + f);

const cases = [
  // word, expected IPA, base word (or null), a Vietnamese meaning that must appear somewhere
  ['paid', '/peɪd/', 'pay', 'thanh toán'],
  ['went', '/wɛnt/', 'go', 'đi'],
  ['children', '/ˈtʃɪldrən/', 'child', 'trẻ'],
  ['run', '/rʌn/', null, 'chạy'],
  ['beautiful', '/ˈbjutəfəl/', null, 'đẹp']
];

(async () => {
  for (const [w, ipa, base, vi] of cases) {
    const d = await lookup(w);
    const allVi = [d.translation, ...d.meanings.flatMap(x => x.terms),
      ...(d.base ? [d.base.translation, ...d.base.meanings.flatMap(x => x.terms)] : [])].join(' | ');
    console.log(w, d.phonetic, '→', d.translation, '| base:', d.base ? d.base.word : '-', '| meanings:', allVi.slice(0, 90));
    assert.strictEqual(d.phonetic, ipa, `${w}: IPA`);
    assert.strictEqual(d.base ? d.base.word : null, base, `${w}: base form`);
    assert(allVi.includes(vi), `${w}: missing "${vi}"`);
  }
  console.log('OK');
})().catch(e => { console.error(e); process.exit(1); });

// E2E: real Chromium + the unpacked extension, on a live website.
// Run: cd /tmp/envi-e2e && node ~/ai_source/envi-dict-extension/e2e.test.js
const { chromium } = require('playwright');
const path = require('path');
const EXT = path.resolve(__dirname);
const URL = process.env.E2E_URL || 'https://en.wikipedia.org/wiki/Dictionary';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

(async () => {
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];

  // Drive settings through the real toolbar popup UI
  const ui = await ctx.newPage();
  await ui.goto(`chrome-extension://${extId}/popup.html`);
  const setMode = async m => { await ui.check(`input[value="${m}"]`); await ui.waitForTimeout(300); };
  const setEnabled = async on => { await ui.setChecked('#enabled', on); await ui.waitForTimeout(300); };

  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  // E2E_WORD: target a plain word inside running text (no element of its own).
  const W = process.env.E2E_WORD;
  const word = W ? null : page.locator(process.env.E2E_SEL || '#mw-content-text p b, #mw-content-text p a').filter({ hasText: /^[A-Za-z]{4,}$/ }).first();
  const target = W || (await word.textContent()).trim();
  let box, cx, cy;
  const measure = async () => {
    if (W) {
      box = await page.evaluate(w => {
        const re = new RegExp('\\b' + w + '\\b');
        const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n; (n = it.nextNode());) {
          const m = re.exec(n.data);
          if (!m || n.parentElement.closest('a,script,style,nav,header')) continue;
          n.parentElement.scrollIntoView({ block: 'center' });
          const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + w.length);
          const b = r.getBoundingClientRect(); if (!b.width) continue;
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        }
      }, W);
    } else { await word.scrollIntoViewIfNeeded(); box = await word.boundingBox(); }
    cx = box.x + box.width / 2; cy = box.y + box.height / 2;
  };
  await measure();
  console.log(`Site: ${URL}  target word: "${target}"`);

  const popup = () => page.evaluate(() => {
    const h = document.querySelector('envi-dict-popup');
    return h ? h.shadowRoot.querySelector('.card').innerText : null;
  });
  const reset = async () => { await page.keyboard.press('Escape'); await page.mouse.click(5, 5); await page.waitForTimeout(200); };
  const waitResult = async () => {
    for (let i = 0; i < 40; i++) { const t = await popup(); if (t && !/Đang tra/.test(t)) return t; await page.waitForTimeout(250); }
    return popup();
  };
  // Links navigate on click; block that so we test the word, not navigation.
  await page.evaluate(() => { window.__block = true; document.addEventListener('click', e => { if (window.__block) e.preventDefault(); }, true); });
  const dbl = async (alt) => {
    await measure();
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.dblclick(cx, cy);
    if (alt) await page.keyboard.up('Alt');
  };
  const drag = async (alt) => {
    await measure();
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.move(box.x + 1, cy); await page.mouse.down();
    await page.mouse.move(box.x + box.width - 1, cy, { steps: 5 }); await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
  };

  // 1. Default mode = Alt + double-click
  const defMode = await ui.evaluate(() => document.querySelector('input[name=mode]:checked').value);
  const label = await ui.locator('input[value="altdbl"]').evaluate(e => e.parentElement.textContent.trim());
  check('default mode is altdbl, label "Giữ Alt + nhấp đúp"', defMode === 'altdbl' && label === 'Giữ Alt + nhấp đúp', `(${defMode}, "${label}")`);

  // 2. altdbl: plain double-click must NOT trigger (the reported bug)
  await reset(); await dbl(false); await page.waitForTimeout(1200);
  check('altdbl: plain double-click → no popup', (await popup()) === null);

  // 3. altdbl: Alt + double-click → popup with Vietnamese
  await reset(); await dbl(true);
  let t = await waitResult();
  check('altdbl: Alt+double-click → popup', !!t && t.toLowerCase().startsWith(target.toLowerCase()) && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(t), '\n      ' + (t || '').replace(/\n+/g, ' | ').slice(0, 160));

  // 3b. Alt+double-click on a link must not navigate/download (page's own click handling active)
  await reset(); await page.evaluate(() => { window.__block = false; });
  const before = page.url(); await dbl(true); await waitResult();
  check('altdbl on a link: no navigation', page.url() === before, page.url());
  await page.evaluate(() => { window.__block = true; });

  // 4. altdbl: Alt + drag-select must NOT trigger (old behaviour removed)
  await reset(); await drag(true); await page.waitForTimeout(1200);
  check('altdbl: Alt+highlight → no popup', (await popup()) === null);

  // 5. Esc closes; click outside closes
  await reset(); await dbl(true); await waitResult();
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('Esc closes popup', (await popup()) === null);
  await dbl(true); await waitResult();
  await page.mouse.click(5, 5); await page.waitForTimeout(200);
  check('click outside closes popup', (await popup()) === null);

  // 6. Clicking inside the popup does not close it
  await dbl(true); await waitResult();
  const pb = await page.evaluate(() => { const r = document.querySelector('envi-dict-popup').getBoundingClientRect(); return { x: r.x + 30, y: r.y + 60 }; });
  await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(300);
  check('click inside popup keeps it open', (await popup()) !== null);

  // 7. Mode dblclick: plain double-click triggers
  await setMode('dblclick'); await reset(); await dbl(false);
  t = await waitResult(); check('dblclick mode: plain double-click → popup', !!t && t.toLowerCase().startsWith(target.toLowerCase()));

  // 8. Mode dblclick: drag-select does not trigger
  await reset(); await drag(false); await page.waitForTimeout(1200);
  check('dblclick mode: highlight → no popup', (await popup()) === null);

  // 9. Mode select: highlight triggers
  await setMode('select'); await reset(); await drag(false);
  t = await waitResult(); check('select mode: highlight → popup', !!t && t.toLowerCase().startsWith(target.toLowerCase()), (t||'').split('\n')[0]);

  // 10. Disabled: nothing triggers
  await setMode('altdbl'); await setEnabled(false); await reset(); await dbl(true); await page.waitForTimeout(1200);
  check('disabled: Alt+double-click → no popup', (await popup()) === null);
  await setEnabled(true);

  // 11. Setting persists across popup reopen
  await setMode('dblclick'); await ui.reload();
  check('mode persists after reopening toolbar popup', await ui.isChecked('input[value="dblclick"]'));
  await setMode('altdbl');

  // 12. Toolbar popup search box
  await ui.fill('#q', 'beautiful'); await ui.press('#q', 'Enter');
  await ui.waitForFunction(() => !/Đang tra/.test(document.querySelector('#out').innerText) && document.querySelector('#out').innerText.length > 0, null, { timeout: 10000 });
  const out = await ui.innerText('#out');
  check('toolbar search "beautiful"', /xinh đẹp|đẹp/.test(out), '→ ' + out.replace(/\n/g, ' | ').slice(0, 100));

  await page.screenshot({ path: '/tmp/envi-e2e/last.png' });
  await ctx.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

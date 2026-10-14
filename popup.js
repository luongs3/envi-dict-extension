const $ = s => document.querySelector(s);

chrome.storage.sync.get({ enabled: true, mode: 'altdbl' }, s => {
  $('#enabled').checked = s.enabled;
  const mode = s.mode === 'alt' ? 'altdbl' : s.mode;
  document.querySelector(`input[value="${mode}"]`).checked = true;
});
$('#enabled').onchange = e => chrome.storage.sync.set({ enabled: e.target.checked });
document.querySelectorAll('input[name=mode]').forEach(r =>
  r.onchange = () => chrome.storage.sync.set({ mode: r.value }));

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function speakBtns(word) {
  const wrap = el('span');
  for (const [accent, label] of [['en-US', '🔊 US'], ['en-GB', '🔊 UK']]) {
    const b = el('button', 'audio', label);
    b.onclick = () => chrome.runtime.sendMessage({ type: 'speak', word, accent });
    wrap.append(b);
  }
  return wrap;
}

function meanings(out, ms) {
  for (const m of ms) {
    if (!m.terms.length) continue;
    out.append(el('div', 'pos', m.posVi), el('div', null, m.terms.join(', ')));
  }
}

$('#q').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.value.trim()) return;
  const out = $('#out');
  out.textContent = 'Đang tra…';
  chrome.runtime.sendMessage({ type: 'lookup', word: e.target.value }, res => {
    out.textContent = '';
    if (!res || !res.ok) { out.textContent = res?.error || 'Lỗi'; return; }
    const d = res.data;
    const h = el('div');
    h.append(el('b', null, d.word + ': ' + d.translation), ' ', el('i', null, d.phonetic), ' ', speakBtns(d.word));
    out.append(h);
    meanings(out, d.meanings);
    if (d.base) {
      const b = el('div', 'base');
      b.append(el('div', null, `${d.base.formVi} `), el('b', null, d.base.word), ' ', el('i', null, d.base.phonetic), ' ', speakBtns(d.base.word));
      if (d.base.meanings.length) {
        b.append(el('div', null, d.base.translation));
        meanings(b, d.base.meanings);
      }
      out.append(b);
    }
  });
});

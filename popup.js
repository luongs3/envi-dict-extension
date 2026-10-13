const $ = s => document.querySelector(s);

chrome.storage.sync.get({ enabled: true, mode: 'altdbl' }, s => {
  $('#enabled').checked = s.enabled;
  const mode = s.mode === 'alt' ? 'altdbl' : s.mode;
  document.querySelector(`input[value="${mode}"]`).checked = true;
});
$('#enabled').onchange = e => chrome.storage.sync.set({ enabled: e.target.checked });
document.querySelectorAll('input[name=mode]').forEach(r =>
  r.onchange = () => chrome.storage.sync.set({ mode: r.value }));

$('#q').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.value.trim()) return;
  const out = $('#out');
  out.textContent = 'Đang tra…';
  chrome.runtime.sendMessage({ type: 'lookup', word: e.target.value }, res => {
    out.textContent = '';
    if (!res || !res.ok) { out.textContent = res?.error || 'Lỗi'; return; }
    const d = res.data;
    const h = document.createElement('div');
    h.innerHTML = '<b></b> <i></i>';
    h.querySelector('b').textContent = d.word + ': ' + d.translation;
    h.querySelector('i').textContent = d.phonetic;
    out.appendChild(h);
    for (const m of d.meanings) {
      if (!m.terms.length) continue;
      const p = document.createElement('div');
      p.className = 'pos'; p.textContent = m.posVi;
      const t = document.createElement('div');
      t.textContent = m.terms.join(', ');
      out.append(p, t);
    }
  });
});

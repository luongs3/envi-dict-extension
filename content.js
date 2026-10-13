(() => {
  if (window.__enviDictLoaded) return;
  window.__enviDictLoaded = true;

  // mode: 'altdbl' (hold Alt + double-click), 'dblclick' (double-click), 'select' (any selection)
  let settings = { enabled: true, mode: 'altdbl' };
  chrome.storage.sync.get(settings, s => {
    settings = s;
    if (settings.mode === 'alt') settings.mode = 'altdbl'; // migrate old option
  });
  chrome.storage.onChanged.addListener(ch => {
    for (const k in ch) settings[k] = ch[k].newValue;
    if (settings.mode === 'alt') settings.mode = 'altdbl';
  });

  let host = null;   // shadow host, isolates popup styles from the page
  let lastWord = '';

  document.addEventListener('mousedown', e => {
    if (host && !e.composedPath().includes(host)) hide();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

  // Modifier state is read from the event itself — never from tracked key state,
  // which gets stuck when keyup is missed (window switch, OS shortcut).
  document.addEventListener('mouseup', e => {
    if (!settings.enabled || (host && e.composedPath().includes(host))) return;
    if (settings.mode === 'select') { setTimeout(handleSelection, 10); return; }
    // Detect double-click via mouseup.detail instead of the 'dblclick' event:
    // Chrome swallows 'dblclick' when Alt is held over a link.
    if (e.button !== 0 || e.detail !== 2) return;
    if (settings.mode === 'dblclick' || (settings.mode === 'altdbl' && e.altKey)) {
      const x = e.clientX, y = e.clientY;
      setTimeout(() => handleWordAt(x, y), 10);
    }
  });
  // Alt+click on a link downloads it in Chrome; suppress that while Alt is our trigger.
  document.addEventListener('click', e => {
    if (settings.enabled && settings.mode === 'altdbl' && e.altKey && e.target.closest && e.target.closest('a[href]')) {
      e.preventDefault();
    }
  }, true);

  function isWord(text) {
    return text && text.length <= 60 && /^[A-Za-z][A-Za-z' -]*$/.test(text);
  }

  // Use the browser selection if it's a word; otherwise extract the word under the
  // cursor (Option+double-click on macOS may not select anything).
  function handleWordAt(x, y) {
    const sel = window.getSelection();
    const text = (sel ? sel.toString() : '').trim();
    if (isWord(text)) { show(text, sel.getRangeAt(0).getBoundingClientRect()); return; }
    const caret = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
    if (!caret || caret.startContainer.nodeType !== Node.TEXT_NODE) return;
    const node = caret.startContainer, s = node.data;
    let a = caret.startOffset, b = a;
    while (a > 0 && /[A-Za-z']/.test(s[a - 1])) a--;
    while (b < s.length && /[A-Za-z']/.test(s[b])) b++;
    const word = s.slice(a, b).replace(/^'+|'+$/g, '');
    if (!isWord(word)) return;
    const r = document.createRange();
    r.setStart(node, a); r.setEnd(node, b);
    sel.removeAllRanges(); sel.addRange(r);
    show(word, r.getBoundingClientRect());
  }

  function handleSelection() {
    const sel = window.getSelection();
    const text = (sel ? sel.toString() : '').trim();
    if (!isWord(text)) return;
    show(text, sel.getRangeAt(0).getBoundingClientRect());
  }

  function ensureHost() {
    if (host) return host.shadowRoot;
    host = document.createElement('envi-dict-popup');
    host.style.cssText = 'position:absolute;z-index:2147483647;top:0;left:0;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<link rel="stylesheet" href="${chrome.runtime.getURL('popup-card.css')}"><div class="card"></div>`;
    document.documentElement.appendChild(host);
    return root;
  }

  function hide() { if (host) { host.remove(); host = null; } }

  function position(rect) {
    const top = window.scrollY + rect.bottom + 8;
    let left = window.scrollX + rect.left;
    left = Math.min(left, window.scrollX + document.documentElement.clientWidth - 360);
    host.style.top = top + 'px';
    host.style.left = Math.max(window.scrollX + 8, left) + 'px';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function show(word, rect) {
    lastWord = word;
    const root = ensureHost();
    const card = root.querySelector('.card');
    position(rect);
    card.innerHTML = `<div class="head"><span class="word">${esc(word)}</span></div><div class="loading">Đang tra…</div>`;

    chrome.runtime.sendMessage({ type: 'lookup', word }, res => {
      if (word !== lastWord || !host) return;
      if (chrome.runtime.lastError || !res || !res.ok) {
        card.innerHTML = `<div class="head"><span class="word">${esc(word)}</span></div>
          <div class="err">${esc(res?.error || 'Lỗi tra từ')}</div>`;
        return;
      }
      render(card, res.data);
    });
  }

  function render(card, d) {
    const meanings = d.meanings.filter(m => m.terms.length).map(m => `
      <div class="pos">${esc(m.posVi)} <span class="pos-en">(${esc(m.pos)})</span></div>
      <ul>${m.terms.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`).join('');
    const examples = d.examples.slice(0, 3).map(x => `
      <div class="ex"><b>${esc(x.pos)}</b>: ${esc(x.def)}${x.example ? `<div class="ex-sample">“${esc(x.example)}”</div>` : ''}</div>`).join('');

    card.innerHTML = `
      <div class="head">
        <span class="word">${esc(d.word)}</span>
        ${d.phonetic ? `<span class="phon">${esc(d.phonetic)}</span>` : ''}
        ${d.audio ? `<button class="audio" title="Phát âm">🔊</button>` : ''}
        <button class="close" title="Đóng">×</button>
      </div>
      <div class="main">${esc(d.translation)}</div>
      ${meanings}
      ${examples ? `<div class="section">English definitions</div>${examples}` : ''}`;

    card.querySelector('.close').onclick = hide;
    const btn = card.querySelector('.audio');
    if (btn) btn.onclick = () => new Audio(d.audio).play().catch(() => {});
  }
})();

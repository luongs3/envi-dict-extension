importScripts('lookup.js');

const cache = new Map();

// Audio plays in an offscreen document, not the web page: page CSP (media-src) on many
// sites blocks extension/remote audio, and a background service worker has no <audio>.
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Play word pronunciation'
  });
}

function ttsUrl(word, accent) {
  return 'https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl='
    + encodeURIComponent(accent) + '&q=' + encodeURIComponent(word);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'lookup') {
    const key = msg.word.toLowerCase();
    if (cache.has(key)) { sendResponse({ ok: true, data: cache.get(key) }); return; }
    lookup(key)
      .then(data => {
        if (cache.size > 500) cache.delete(cache.keys().next().value);
        cache.set(key, data);
        sendResponse({ ok: true, data });
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.type === 'speak') {
    const accent = msg.accent === 'en-GB' ? 'en-GB' : 'en-US';
    ensureOffscreen()
      .then(() => chrome.runtime.sendMessage({ type: 'play', url: ttsUrl(msg.word, accent) }))
      .then(res => sendResponse(res || { ok: false }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

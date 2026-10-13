importScripts('lookup.js');

const cache = new Map();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'lookup') return;
  const key = msg.word.toLowerCase();
  if (cache.has(key)) { sendResponse({ ok: true, data: cache.get(key) }); return; }
  lookup(key)
    .then(data => {
      if (cache.size > 500) cache.delete(cache.keys().next().value);
      cache.set(key, data);
      sendResponse({ ok: true, data });
    })
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true; // async response
});

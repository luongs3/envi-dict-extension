const audio = document.getElementById('a');

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'play') return;
  audio.src = msg.url;
  audio.play()
    .then(() => {
      // Reply once playback finishes so the caller can verify a real clip played.
      audio.onended = () => sendResponse({ ok: true, duration: audio.duration });
      audio.onerror = () => sendResponse({ ok: false, error: 'playback error' });
    })
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});

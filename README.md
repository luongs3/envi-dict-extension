# EnVi Dictionary

Chrome extension (Manifest V3) for English → Vietnamese lookup, inspired by Laban Dictionary.

**Hold Alt (Option on macOS) and double-click any English word** on a page → a popup shows:

- IPA pronunciation + 🔊 audio
- Main Vietnamese translation
- Vietnamese meanings grouped by part of speech (danh từ, động từ, tính từ…)
- Short English definitions with examples

Trigger modes (toolbar popup): **Alt + double-click** (default), plain double-click, or any selection. The toolbar popup also has a search box.

## Install

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder

## Data sources

No API keys required.

- Vietnamese meanings: Google Translate public endpoint (`translate.googleapis.com`, unofficial — may be rate-limited)
- IPA / audio / English definitions: [Free Dictionary API](https://dictionaryapi.dev/) (4s timeout; popup still shows Vietnamese if it's down)

## Tests

```sh
node test.js                 # lookup logic against real APIs
npm i playwright && npx playwright install chromium
node e2e.test.js             # loads the extension in Chromium, drives a live site
E2E_URL=https://news.ycombinator.com/newsfaq.html E2E_WORD=points node e2e.test.js
```

## License

MIT

// Shared lookup logic (used by background.js and test.js).
const POS_VI = {
  noun: 'danh từ', verb: 'động từ', adjective: 'tính từ', adverb: 'trạng từ',
  pronoun: 'đại từ', preposition: 'giới từ', conjunction: 'liên từ',
  interjection: 'thán từ', article: 'mạo từ', abbreviation: 'viết tắt',
  prefix: 'tiền tố', suffix: 'hậu tố', exclamation: 'thán từ'
};

async function fetchJson(url, ms = 4000) {
  // Each source gets a hard timeout: dictionaryapi.dev intermittently hangs ~20s (HTTP 522)
  // and must never block the Vietnamese result from Google.
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function lookup(word) {
  word = word.trim().toLowerCase();
  const gUrl = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi'
    + '&dt=t&dt=bd&dt=rm&dj=1&q=' + encodeURIComponent(word);
  const dUrl = 'https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word);
  const [g, d] = await Promise.all([fetchJson(gUrl), fetchJson(dUrl)]);
  if (!g && !d) throw new Error('Không kết nối được dịch vụ tra từ');

  const result = { word, phonetic: '', audio: '', translation: '', meanings: [], examples: [] };

  if (g) {
    const N = s => (s || '').normalize('NFC').trim().toLowerCase();
    result.translation = (g.sentences || []).map(s => s.trans).filter(Boolean).join('').normalize('NFC');
    const translit = (g.sentences || []).find(s => s.src_translit);
    if (translit) result.phonetic = '/' + translit.src_translit + '/';
    for (const b of g.dict || []) {
      const all = (b.entry || []).map(e => e.word.normalize('NFC'));
      // Google's entry order isn't by relevance; put the main translation first
      const main = all.find(w => N(w) === N(result.translation));
      const terms = (main ? [main, ...all.filter(w => w !== main)] : all).slice(0, 8);
      result.meanings.push({ pos: b.pos, posVi: POS_VI[b.pos] || b.pos, terms });
    }
  }

  if (Array.isArray(d) && d[0]) {
    const e = d[0];
    const ph = (e.phonetics || []);
    const withText = ph.find(p => p.text) || {};
    result.phonetic = e.phonetic || withText.text || result.phonetic;
    const us = ph.find(p => p.audio && /-us\.mp3$/.test(p.audio));
    result.audio = (us || ph.find(p => p.audio) || {}).audio || '';
    // English definitions as context, grouped by POS
    for (const m of e.meanings || []) {
      const def = (m.definitions || [])[0];
      if (!def) continue;
      result.examples.push({ pos: m.partOfSpeech, def: def.definition, example: def.example || '' });
      // Add POS from dictionaryapi when Google has none (e.g. inflected forms)
      if (!result.meanings.some(x => x.pos === m.partOfSpeech) && !g?.dict) {
        result.meanings.push({ pos: m.partOfSpeech, posVi: POS_VI[m.partOfSpeech] || m.partOfSpeech, terms: [] });
      }
    }
  }
  return result;
}

if (typeof module !== 'undefined') module.exports = { lookup };

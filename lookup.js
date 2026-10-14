// Shared lookup logic (used by background.js and test.js).
const POS_VI = {
  noun: 'danh từ', verb: 'động từ', adjective: 'tính từ', adverb: 'trạng từ',
  pronoun: 'đại từ', preposition: 'giới từ', conjunction: 'liên từ',
  interjection: 'thán từ', article: 'mạo từ', abbreviation: 'viết tắt',
  prefix: 'tiền tố', suffix: 'hậu tố', exclamation: 'thán từ', determiner: 'hạn định từ'
};

// "past and past participle of pay1." → inflection label + base word
const FORM_VI = [
  [/^past and past participle of/, 'quá khứ & quá khứ phân từ của'],
  [/^past participle of/, 'quá khứ phân từ của'],
  [/^past(?: tense)? of/, 'quá khứ của'],
  [/^plural (?:form )?of/, 'số nhiều của'],
  [/^comparative (?:form )?of/, 'so sánh hơn của'],
  [/^superlative (?:form )?of/, 'so sánh nhất của'],
  [/^third person singular present of/, 'ngôi 3 số ít của'],
  [/^present participle of/, 'hiện tại phân từ của']
];

let IPA = null; // CMU Pronouncing Dictionary → IPA, bundled (ipa.json)

async function loadIpa() {
  if (IPA) return IPA;
  try {
    const url = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.getURL('ipa.json') : null;
    IPA = url ? await (await fetch(url)).json() : require('./ipa.json');
  } catch { IPA = {}; }
  return IPA;
}

async function fetchJson(url, ms = 5000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// Two client IDs for the same endpoint: if one is rate-limited (HTTP 429), try the other.
async function google(word) {
  const qs = 'sl=en&tl=vi&hl=en&dt=t&dt=bd&dt=md&dt=rm&dj=1&q=' + encodeURIComponent(word);
  return await fetchJson('https://translate.googleapis.com/translate_a/single?client=gtx&' + qs)
    || await fetchJson('https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&' + qs);
}

const N = s => (s || '').normalize('NFC').trim().toLowerCase();

// Vietnamese meanings grouped by POS, main translation first.
function parseMeanings(g, translation) {
  return (g.dict || []).map(b => {
    const all = (b.entry || []).map(e => e.word.normalize('NFC'));
    // Google lists senses alphabetically with no score. Rank by syllables shared with the
    // main translation (pay → "chi trả": trả, trả tiền, trả nợ… before "đóng tiền phạt").
    const main = all.find(w => N(w) === N(translation));
    const mainSyl = new Set(N(translation).split(/\s+/));
    const overlap = w => N(w).split(/\s+/).filter(x => mainSyl.has(x)).length;
    const ranked = all.map((w, i) => ({ w, i, s: overlap(w) }))
      .sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.w);
    const order = main ? [main, ...ranked.filter(w => w !== main)] : ranked;
    return { pos: b.pos, posVi: POS_VI[b.pos] || b.pos, terms: order.slice(0, 8) };
  });
}

function parseDefinitions(g) {
  return (g.definitions || []).map(d => ({
    pos: d.pos,
    defs: (d.entry || []).slice(0, 2).map(e => ({ def: e.gloss, example: e.example || '' }))
  }));
}

// Detect an inflected form (paid → pay, went → go, children → child).
function findBase(word, g) {
  for (const d of [...(g.definitions || []), ...(g.dict || [])]) {
    if (d.base_form && N(d.base_form) !== word) {
      return { base: N(d.base_form), formVi: 'dạng biến thể của', pos: d.pos };
    }
  }
  for (const d of g.definitions || []) {
    const gloss = ((d.entry || [])[0] || {}).gloss || '';
    for (const [re, vi] of FORM_VI) {
      const m = gloss.match(new RegExp(re.source + /\s+([a-z]+)\d*/.source, 'i'));
      if (m) return { base: m[1].toLowerCase(), formVi: vi, pos: d.pos };
    }
  }
  return null;
}

async function lookup(word) {
  word = word.trim().toLowerCase();
  const [g, ipa] = await Promise.all([google(word), loadIpa()]);
  if (!g) throw new Error('Không kết nối được dịch vụ tra từ');

  const translation = (g.sentences || []).map(s => s.trans).filter(Boolean).join('').normalize('NFC');
  const translit = (g.sentences || []).find(s => s.src_translit);
  const result = {
    word,
    phonetic: ipa[word] ? `/${ipa[word]}/` : (translit ? `/${translit.src_translit}/` : ''),
    translation,
    meanings: parseMeanings(g, translation),
    definitions: parseDefinitions(g),
    base: null
  };

  // Inflected word: also show the base word's full entry (Google gives inflections very few meanings).
  const base = findBase(word, g);
  if (base && base.base !== word) {
    const bg = await google(base.base);
    if (bg) {
      const bt = (bg.sentences || []).map(s => s.trans).join('').normalize('NFC');
      // Google often already returns the base word's meanings for the inflection (went → go);
      // only repeat the base block when it adds something.
      const dictIsBase = (g.dict || []).length && (g.dict || []).every(b => N(b.base_form) === base.base);
      // paid = past of the VERB pay → show pay's verb meanings before its noun meanings
      const byPos = list => list.slice().sort((a, b) => (b.pos === base.pos) - (a.pos === base.pos));
      result.base = {
        word: base.base, formVi: base.formVi, translation: bt,
        phonetic: ipa[base.base] ? `/${ipa[base.base]}/` : '',
        meanings: dictIsBase ? [] : byPos(parseMeanings(bg, bt)),
        definitions: dictIsBase ? [] : byPos(parseDefinitions(bg))
      };
    }
  }
  return result;
}

if (typeof module !== 'undefined') module.exports = { lookup, findBase };

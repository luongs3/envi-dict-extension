"""Build ipa.json from the CMU Pronouncing Dictionary (BSD-style license).
Usage: curl -sLO https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
       python3 tools/build_ipa.py cmudict.dict > ipa.json
"""
import json, re, sys

ARPA = {'AA': 'ɑ', 'AE': 'æ', 'AH': 'ʌ', 'AO': 'ɔ', 'AW': 'aʊ', 'AY': 'aɪ', 'B': 'b', 'CH': 'tʃ', 'D': 'd',
        'DH': 'ð', 'EH': 'ɛ', 'ER': 'ɝ', 'EY': 'eɪ', 'F': 'f', 'G': 'ɡ', 'HH': 'h', 'IH': 'ɪ', 'IY': 'i',
        'JH': 'dʒ', 'K': 'k', 'L': 'l', 'M': 'm', 'N': 'n', 'NG': 'ŋ', 'OW': 'oʊ', 'OY': 'ɔɪ', 'P': 'p',
        'R': 'r', 'S': 's', 'SH': 'ʃ', 'T': 't', 'TH': 'θ', 'UH': 'ʊ', 'UW': 'u', 'V': 'v', 'W': 'w',
        'Y': 'j', 'Z': 'z', 'ZH': 'ʒ'}
VOWELS = {'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'}
# Legal English syllable onsets (maximal-onset principle decides where the stress mark goes).
ONSETS = {(c,) for c in 'P T K B D G F TH S SH HH V DH Z ZH CH JH M N L R W Y'.split()} | {tuple(o.split()) for o in '''
P L|P R|P Y|B L|B R|B Y|T R|T W|T Y|D R|D W|D Y|K L|K R|K W|K Y|G L|G R|G W|F L|F R|F Y|TH R|TH W
SH R|S P|S T|S K|S M|S N|S L|S W|S F|S Y|M Y|N Y|HH Y|HH W|V Y|L Y
S P L|S P R|S P Y|S T R|S T Y|S K L|S K R|S K W|S K Y'''.replace('\n', '|').split('|') if o.strip()}


def to_ipa(phones):
    toks = [re.match(r'([A-Z]+)(\d)?', t).groups() for t in phones.split()]
    out = []  # list of (symbol, phone, is_vowel)
    for p, s in toks:
        sym = ARPA[p]
        if p == 'AH' and s == '0': sym = 'ə'
        if p == 'ER' and s == '0': sym = 'ɚ'
        if s in ('1', '2'):
            # walk back over consonants as long as they form a legal onset
            j = len(out)
            while j > 0 and not out[j - 1][2] and tuple(x[1] for x in out[j - 1:]) in ONSETS:
                j -= 1
            # out[j:] is now the onset; if no vowel precedes, stress mark goes at the start
            if not any(x[2] for x in out[:j]): j = 0
            out.insert(j, ('ˈ' if s == '1' else 'ˌ', '', True))
        out.append((sym, p, p in VOWELS))
    ipa = ''.join(x[0] for x in out)
    # one-syllable words don't need a stress mark
    return ipa.lstrip('ˈ') if sum(1 for _, p, v in out if v and p) == 1 else ipa


d = {}
for line in open(sys.argv[1], encoding='utf-8'):
    line = line.split('#')[0].strip()
    if not line: continue
    w, ph = line.split(' ', 1)
    if '(' in w or not re.fullmatch(r"[a-z']+", w): continue
    d[w] = to_ipa(ph)
json.dump(d, sys.stdout, ensure_ascii=False, separators=(',', ':'))

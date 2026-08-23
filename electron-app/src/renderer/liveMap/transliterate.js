// Mechanical Cyrillic-to-Latin transliteration (the official Ukrainian national system, same one
// already used for the raion/oblast English names elsewhere on this map) - used only for the one
// piece of text this app has no curated or source-provided English variant for at all: an
// arbitrary settlement name coming straight from Neptun's API. Showing it untransliterated next to
// already-English text mixed two scripts in one line; this isn't a real translation (it's still
// the same Ukrainian name, just spelled in Latin letters), but it reads as one consistent language
// instead of two.
const SIMPLE = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'y', і: 'i',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ъ: '', "'": '', '’': '', ʼ: '',
};
// є/ї/й/ю/я transliterate differently at the start of a word than in the middle of one.
const WORD_INITIAL = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' };
const MEDIAL = { є: 'ie', ї: 'i', й: 'i', ю: 'iu', я: 'ia' };

function transliterateWord(word) {
    let result = '';
    for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        const lower = ch.toLowerCase();
        const table = i === 0 ? WORD_INITIAL : MEDIAL;
        let mapped = table[lower] ?? SIMPLE[lower];
        if (mapped === undefined) {
            result += ch; // already Latin, a digit, punctuation, etc.
            continue;
        }
        if (ch !== lower && mapped) mapped = mapped[0].toUpperCase() + mapped.slice(1);
        result += mapped;
    }
    return result;
}

function transliterate(text) {
    // Split on (and keep) whitespace/hyphens so each side of "Кам'янець-Подільський" or a
    // multi-word settlement name gets its own word-initial treatment, not just the very first
    // letter of the whole string.
    return text
        .split(/([\s-]+)/)
        .map((part) => (/^[\s-]+$/.test(part) ? part : transliterateWord(part)))
        .join('');
}

export { transliterate };

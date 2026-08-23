// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

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
            result += ch;
            continue;
        }
        if (ch !== lower && mapped) mapped = mapped[0].toUpperCase() + mapped.slice(1);
        result += mapped;
    }
    return result;
}

function transliterate(text) {
    // The capturing group keeps the whitespace/hyphen delimiters in the split result, so each
    // side of "Кам'янець-Подільський" gets its own word-initial treatment.
    return text
        .split(/([\s-]+)/)
        .map((part) => (/^[\s-]+$/.test(part) ? part : transliterateWord(part)))
        .join('');
}

export { transliterate };

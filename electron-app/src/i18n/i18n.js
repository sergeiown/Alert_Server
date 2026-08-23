// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const en = require('./en.json');
const uk = require('./uk.json');

const dictionaries = { English: en, Ukrainian: uk };

function t(key, language) {
    const dict = dictionaries[language] || dictionaries.English;
    return dict[key] || key;
}

function getDictionary(language) {
    return dictionaries[language] || dictionaries.English;
}

module.exports = { t, getDictionary };

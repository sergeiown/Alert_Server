/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs');
const path = require('path');
const languageFilePath = path.join(process.env.TEMP, 'alertserver_language.tmp');

function getCurrentLanguage() {
    if (fs.existsSync(languageFilePath)) {
        return fs.readFileSync(languageFilePath, 'utf-8').trim();
    }
    fs.writeFileSync(languageFilePath, 'English', 'utf-8');
    return 'English';
}

module.exports = { getCurrentLanguage };

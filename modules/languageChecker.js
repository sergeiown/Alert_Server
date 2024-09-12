/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { getSettings, updateSetting } = require('./settings');

function getCurrentLanguage() {
    const settings = getSettings();
    const currentLanguage = settings.language;

    if (!currentLanguage) {
        updateSetting('language', 'English');
        return 'English';
    }

    return currentLanguage;
}

module.exports = { getCurrentLanguage };

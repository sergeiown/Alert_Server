/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs');
const path = require('path');
const { getCurrentLanguage } = require('./languageChecker');
const { handleRecovery } = require('./recoveryHandler');

let messages;

const messagesPath =
    getCurrentLanguage() === 'English'
        ? path.join(process.cwd(), 'messagesEng.json')
        : path.join(process.cwd(), 'messagesUkr.json');

try {
    const fileContent = fs.readFileSync(messagesPath, 'utf8');

    messages = JSON.parse(fileContent);

    for (let key in messages) {
        if (messages.hasOwnProperty(key)) {
            try {
                messages[key] = Buffer.from(messages[key], 'base64').toString('utf8');
            } catch (decodeError) {
                console.error(`Decoding error for a key ${key}:`, decodeError.message);
            }
        }
    }
} catch (error) {
    handleRecovery(error);
}

module.exports = messages;

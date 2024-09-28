/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs');
const path = require('path');
const { getCurrentLanguage } = require('./languageChecker');
const { handleRecovery } = require('./recoveryHandler');

let messages;

const messagesPath = path.join(process.cwd(), 'messages.json');

try {
    const fileContent = fs.readFileSync(messagesPath, 'utf8');
    const parsedMessages = JSON.parse(fileContent);
    const currentLanguage = getCurrentLanguage();
    const languageMessages = parsedMessages.messages[currentLanguage];

    if (!languageMessages) {
        console.error(`Language ${currentLanguage} not found in messages.`);
        return;
    }

    for (let key in languageMessages) {
        if (languageMessages.hasOwnProperty(key)) {
            try {
                languageMessages[key] = Buffer.from(languageMessages[key], 'base64').toString('utf8');
            } catch (decodeError) {
                console.error(`Decoding error for a key ${key}:`, decodeError.message);
            }
        }
    }

    messages = languageMessages;
} catch (error) {
    handleRecovery(error);
}

module.exports = messages;

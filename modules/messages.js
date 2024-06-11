/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs');
const path = require('path');

const messagesPath = path.join(__dirname, '../messagesUkr.json');
const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));

for (let key in messages) {
    if (messages.hasOwnProperty(key)) {
        messages[key] = Buffer.from(messages[key], 'base64').toString('utf8');
    }
}

module.exports = messages;

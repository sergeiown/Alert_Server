/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs');
const path = require('path');

const messagesPath = path.join(__dirname, '../messagesUkr.json');
let messages;

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
    const currentDateTime = new Date()
        .toLocaleString('UA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
        .replace(/,\s*/g, ',');
    const logMessage = `${currentDateTime},An error occurred while reading or parsing a messages file`;
    const logFilePath = path.join(process.env.TEMP, 'alertserver_log.csv');
    fs.appendFileSync(logFilePath, '\n' + logMessage, 'utf-8');
    console.error(logMessage);
    messages = {};
}

module.exports = messages;

/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getCurrentLanguage } = require('./languageChecker');

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
    const logMessage = `${currentDateTime},File not found: ${messagesPath}. Starting the recovery process.`;
    const logFilePath = path.join(process.cwd(), 'event.log');
    const recoveryBatPath = path.join(process.cwd(), 'start_recovery.bat');
    fs.appendFileSync(logFilePath, logMessage + os.EOL, 'utf-8');
    console.error(logMessage);

    exec(`start cmd /c "${recoveryBatPath}"`, (execError) => {
        if (execError) {
            console.error(execError.message);
            return;
        }
    });
}

module.exports = messages;

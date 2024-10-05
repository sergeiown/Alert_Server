/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { log, error } = require('console');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logFilePath = path.join(process.cwd(), 'event.log');

const header = `Date,Time,Event`;

async function initializeLogFile() {
    try {
        const fileExists = await fs
            .access(logFilePath)
            .then(() => true)
            .catch(() => false);
        if (!fileExists) {
            await fs.writeFile(logFilePath, header + os.EOL, 'utf-8');
        }
    } catch (err) {
        error(err.message);
    }
}

function getCurrentDateTime() {
    return new Date()
        .toLocaleString('uk-UA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
        .replace(/,\s*/g, ',')
        .trim();
}

function formatLogMessage(message) {
    return typeof message === 'string' ? message.trim() : JSON.stringify(message).trim();
}

async function logEventAsync(eventMessage) {
    await initializeLogFile();
    const maxFileSize = 256 * 1024;
    const currentDateTime = getCurrentDateTime() || '00.00.0000,00:00:00';
    const logMessage = `${currentDateTime},${formatLogMessage(eventMessage)}`;

    try {
        const stats = await fs.stat(logFilePath);
        if (stats.size > maxFileSize) {
            const fileContent = (await fs.readFile(logFilePath, 'utf-8')).split(os.EOL);
            const newContent = `${header}${os.EOL}${fileContent.slice(100).join(os.EOL)}`;
            const fileSize = `${currentDateTime},Log file size: ${(stats.size / 1024).toFixed(2)} Kb`;
            const fileReduction = `${currentDateTime},Log file size reduced`;

            await fs.writeFile(logFilePath, newContent + fileSize + os.EOL + fileReduction + os.EOL, 'utf-8');
            log(fileSize + os.EOL + fileReduction);
        }
    } catch (err) {
        error(err.message);
    }

    try {
        await fs.appendFile(logFilePath, logMessage + os.EOL, 'utf-8');
        log(logMessage);
    } catch (err) {
        error(err.message);
    }
}

// Synchronous shell that starts logging asynchronously
function logEvent(eventMessage) {
    setImmediate(() => {
        logEventAsync(eventMessage).catch((err) => error(err.message));
    });
}

module.exports = { logEvent };

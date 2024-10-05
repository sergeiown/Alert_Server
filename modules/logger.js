/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { log, error } = require('console');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logFilePath = path.join(process.cwd(), 'event.log');

const header = `Date,Time,Event`;

function initializeLogFile() {
    try {
        if (!fs.existsSync(logFilePath)) {
            fs.writeFileSync(logFilePath, header + os.EOL, 'utf-8');
        }
    } catch (err) {
        error(err.message);
    }
}

function getCurrentDateTime() {
    try {
        return new Date()
            .toLocaleString('UA', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            })
            .replace(/,\s*/g, ',')
            .trim();
    } catch (err) {
        error(err.message);
        return null;
    }
}

function formatLogMessage(message) {
    if (typeof message === 'string') {
        return message.trim();
    }

    try {
        return JSON.stringify(message).trim();
    } catch (err) {
        return err.message;
    }
}

function logEvent(eventMessage) {
    initializeLogFile();

    const maxFileSize = 256 * 1024;
    let currentDateTime = getCurrentDateTime() || '00.00.0000,00:00:00';

    const logMessage = `${currentDateTime},${formatLogMessage(eventMessage)}`;

    try {
        const stats = fs.statSync(logFilePath);
        if (stats.size > maxFileSize) {
            const fileContent = fs.readFileSync(logFilePath, 'utf-8').split(os.EOL);
            const newContent = `${header}${os.EOL}${fileContent.slice(25).join(os.EOL)}`;
            const fileSize = `${currentDateTime},Log file size: ${(stats.size / 1024).toFixed(2)} Kb`;
            const fileReduction = `${currentDateTime},Log file size reduced`;

            fs.writeFileSync(logFilePath, newContent + fileSize + os.EOL + fileReduction + os.EOL, 'utf-8');
            log(fileSize + os.EOL + fileReduction);
        }
    } catch (err) {
        error(err.message);
    }

    try {
        fs.appendFileSync(logFilePath, logMessage + os.EOL, 'utf-8');
        log(logMessage);
    } catch (err) {
        error(err.message);
    }
}

module.exports = { logEvent };

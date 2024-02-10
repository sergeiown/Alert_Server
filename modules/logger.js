/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { log } = require('console');
const fs = require('fs');
const path = require('path');
const messages = require('../messages.json');
const logFilePath = path.join(process.env.TEMP, 'log.csv');

const initializeLogFile = () => {
    try {
        if (!fs.existsSync(logFilePath)) {
            const header = 'Date,Time,Event';
            fs.writeFileSync(logFilePath, header, 'utf-8');
        }
    } catch (error) {
        log.error(atob(messages.msg_08));
    }
};

const logEvent = (eventMessage) => {
    initializeLogFile();

    const maxFileSize = 256 * 1024; // 256Kb

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

    try {
        const stats = fs.statSync(logFilePath);
        if (stats.size > maxFileSize) {
            const fileContent = fs.readFileSync(logFilePath, 'utf-8').split('\n');
            const newContent = 'Date,Time,Event\n' + fileContent.slice(25).join('\n');
            const fileSize = `${currentDateTime},Log file size: ${(stats.size / 1024).toFixed(2)} Kb`;
            const fileReduction = `${currentDateTime},Log file size reduced`;

            fs.writeFileSync(logFilePath, newContent + '\n' + fileSize + '\n' + fileReduction, 'utf-8');
            log(fileSize + '\n' + fileReduction);
        }
    } catch (error) {
        log.error(atob(messages.msg_09));
    }

    const logMessage = `${currentDateTime},${eventMessage.trim()}`;

    fs.appendFileSync(logFilePath, '\n' + logMessage, 'utf-8');
    log(logMessage);
};

module.exports = { logEvent };

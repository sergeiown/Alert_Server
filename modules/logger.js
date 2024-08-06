/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { log, error, warn } = require('console');
const fs = require('fs');
const path = require('path');
const os = require('os');
const messages = require('./messageLoader');
const logFilePath = path.join(process.env.TEMP, 'alertserver_log.csv');

const initializeLogFile = () => {
    try {
        if (!fs.existsSync(logFilePath)) {
            const header = messages.msg_36;
            fs.writeFileSync(logFilePath, header + os.EOL, 'utf-8');
        }
    } catch (err) {
        error(messages.msg_08);
    }
};

const getCurrentDateTime = () => {
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
        error(messages.msg_09 + err.message);
        return null;
    }
};

const logEvent = (eventMessage) => {
    initializeLogFile();

    const maxFileSize = 256 * 1024;

    let currentDateTime = getCurrentDateTime() || '00.00.0000,00:00:00';

    try {
        const stats = fs.statSync(logFilePath);
        if (stats.size > maxFileSize) {
            const fileContent = fs.readFileSync(logFilePath, 'utf-8').split(os.EOL);
            const newContent = `${messages.msg_36}${os.EOL}${fileContent.slice(25).join(os.EOL)}`;
            const fileSize = `${currentDateTime},${messages.msg_37}: ${(stats.size / 1024).toFixed(2)} Kb`;
            const fileReduction = `${currentDateTime},${messages.msg_38}`;

            fs.writeFileSync(logFilePath, newContent + fileSize + os.EOL + fileReduction + os.EOL, 'utf-8');
            log(fileSize + os.EOL + fileReduction);
        }
    } catch (err) {
        error(messages.msg_09 + err.message);
    }

    const logMessage = `${currentDateTime},${eventMessage.trim()}`;

    try {
        if (logMessage.includes('00.00.0000,00:00:00')) {
            fs.appendFileSync(logFilePath, logMessage + messages.msg_65 + os.EOL, 'utf-8');
            warn(messages.msg_09 + messages.msg_65);
        } else {
            fs.appendFileSync(logFilePath, logMessage + os.EOL, 'utf-8');
            log(logMessage);
        }
    } catch (err) {
        error(messages.msg_09 + err.message);
    }
};

module.exports = { logEvent };

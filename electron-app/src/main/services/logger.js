// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const os = require('os');
const { getUserDataFile } = require('./appPaths');
const { transliterate } = require('./transliterate');

const LOG_FILE = 'alert_server_log.csv';
const OLD_LOG_FILES = ['event.csv', 'event.log'];
const MAX_SIZE_BYTES = 1024 * 1024;
const LINES_TO_DROP = 100;

const LOG_LEVELS = ['INFO', 'WARNING', 'ERROR', 'NETWORK', 'ALERT'];

function csvField(value) {
    const str = String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const SEP_DIRECTIVE = 'sep=,';
const HEADER = 'Date,Time,Level,Event';
const OLD_HEADER = 'Date,Time,Event';
const PREAMBLE = SEP_DIRECTIVE + os.EOL + HEADER;

function initializeLogFile() {
    const filePath = getUserDataFile(LOG_FILE);

    if (!fs.existsSync(filePath)) {

        const oldFilePath = OLD_LOG_FILES.map(getUserDataFile).find(fs.existsSync);
        if (oldFilePath) {
            fs.renameSync(oldFilePath, filePath);
        } else {
            fs.writeFileSync(filePath, PREAMBLE + os.EOL, 'utf-8');
            return;
        }
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.startsWith(SEP_DIRECTIVE)) return;

    const firstLine = content.split(/\r\n|\n|\r/, 1)[0];
    const rest = firstLine === HEADER || firstLine === OLD_HEADER ? content.slice(firstLine.length) : os.EOL + content;
    fs.writeFileSync(filePath, PREAMBLE + rest, 'utf-8');
}

function truncateIfNeeded(filePath) {
    const { size } = fs.statSync(filePath);
    if (size <= MAX_SIZE_BYTES) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r\n|\n|\r/).filter((line) => line.length > 0);
    const preambleLines = lines.slice(0, 2);
    const remaining = lines.slice(2).slice(LINES_TO_DROP);

    fs.writeFileSync(filePath, [...preambleLines, ...remaining].join(os.EOL) + os.EOL, 'utf-8');
}

function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isoTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function logEvent(message, level = 'INFO') {
    const filePath = getUserDataFile(LOG_FILE);
    initializeLogFile();
    truncateIfNeeded(filePath);

    const now = new Date();
    const date = isoDate(now);
    const time = isoTime(now);

    const rawText = typeof message === 'string' ? message : JSON.stringify(message);
    const text = transliterate(rawText);
    const resolvedLevel = LOG_LEVELS.includes(level) ? level : 'INFO';

    fs.appendFileSync(filePath, `${date},${time},${resolvedLevel},${csvField(text)}${os.EOL}`, 'utf-8');

    console.log(`[${resolvedLevel}] ${text}`);
}

function clearLog() {
    const filePath = getUserDataFile(LOG_FILE);
    fs.writeFileSync(filePath, PREAMBLE + os.EOL, 'utf-8');
}

module.exports = { logEvent, clearLog, LOG_FILE };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const os = require('os');
const { getUserDataFile } = require('./appPaths');

const MAX_SIZE_BYTES = 256 * 1024;
const LINES_TO_DROP = 100;

function csvField(value) {
    const str = String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function initializeLogFile() {
    const filePath = getUserDataFile('event.log');
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, 'Date,Time,Event' + os.EOL, 'utf-8');
    }
}

function truncateIfNeeded(filePath) {
    const { size } = fs.statSync(filePath);
    if (size <= MAX_SIZE_BYTES) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r\n|\n|\r/).filter((line) => line.length > 0);
    const [header, ...rest] = lines;
    const remaining = rest.slice(LINES_TO_DROP);

    fs.writeFileSync(filePath, [header, ...remaining].join(os.EOL) + os.EOL, 'utf-8');
}

function logEvent(message) {
    const filePath = getUserDataFile('event.log');
    initializeLogFile();
    truncateIfNeeded(filePath);

    const now = new Date();
    const date = now.toLocaleDateString('uk-UA');
    const time = now.toLocaleTimeString('uk-UA');
    const text = typeof message === 'string' ? message : JSON.stringify(message);

    fs.appendFileSync(filePath, `${date},${time},${csvField(text)}${os.EOL}`, 'utf-8');

    console.log(text);
}

function clearLog() {
    const filePath = getUserDataFile('event.log');
    fs.writeFileSync(filePath, 'Date,Time,Event' + os.EOL, 'utf-8');
}

module.exports = { logEvent, clearLog };

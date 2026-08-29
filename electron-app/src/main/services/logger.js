// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const os = require('os');
const { getUserDataFile } = require('./appPaths');

const LOG_FILE = 'event.csv';
const OLD_LOG_FILE = 'event.log';
const MAX_SIZE_BYTES = 1024 * 1024;
const LINES_TO_DROP = 100;

// Four fixed categories, so a scan of the log (or a filter in Notepad/Excel) can tell at a glance
// what happened without reading every message: NETWORK for any request/response outcome (success
// or failure) against an outside source, ERROR for the app's own bugs/crashes, WARNING for a
// degraded-but-recovered-from state (missing config, an empty/stale source), and INFO for
// everything else (lifecycle, user actions). Falls back to INFO for an unrecognized level rather
// than throwing, since a bad level string shouldn't be able to take the log itself down.
const LOG_LEVELS = ['INFO', 'WARNING', 'ERROR', 'NETWORK'];

function csvField(value) {
    const str = String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const HEADER = 'Date,Time,Level,Event';
const OLD_HEADER = 'Date,Time,Event';

function initializeLogFile() {
    const filePath = getUserDataFile(LOG_FILE);

    if (!fs.existsSync(filePath)) {
        // An install updated from before the log used a .csv extension left its history under the
        // old name - renamed forward rather than started fresh, so that history isn't just lost.
        const oldFilePath = getUserDataFile(OLD_LOG_FILE);
        if (fs.existsSync(oldFilePath)) {
            fs.renameSync(oldFilePath, filePath);
        } else {
            fs.writeFileSync(filePath, HEADER + os.EOL, 'utf-8');
            return;
        }
    }

    // An install updated from before the Level column existed left its old 3-column header in
    // place - only the header line needs rewriting; the older rows above stay as they were
    // written (a plain viewer just shows those with an empty Level cell, harmless).
    const firstLine = fs.readFileSync(filePath, 'utf-8').split(/\r\n|\n|\r/, 1)[0];
    if (firstLine === OLD_HEADER) {
        const content = fs.readFileSync(filePath, 'utf-8');
        fs.writeFileSync(filePath, HEADER + content.slice(firstLine.length), 'utf-8');
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

function logEvent(message, level = 'INFO') {
    const filePath = getUserDataFile(LOG_FILE);
    initializeLogFile();
    truncateIfNeeded(filePath);

    const now = new Date();
    const date = now.toLocaleDateString('uk-UA');
    const time = now.toLocaleTimeString('uk-UA');
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    const resolvedLevel = LOG_LEVELS.includes(level) ? level : 'INFO';

    fs.appendFileSync(filePath, `${date},${time},${resolvedLevel},${csvField(text)}${os.EOL}`, 'utf-8');

    console.log(`[${resolvedLevel}] ${text}`);
}

function clearLog() {
    const filePath = getUserDataFile(LOG_FILE);
    fs.writeFileSync(filePath, HEADER + os.EOL, 'utf-8');
}

module.exports = { logEvent, clearLog, LOG_FILE };

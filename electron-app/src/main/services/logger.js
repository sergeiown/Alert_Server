// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const os = require('os');
const { getUserDataFile } = require('./appPaths');
const { transliterate } = require('./transliterate');

const LOG_FILE = 'event.csv';
const OLD_LOG_FILE = 'event.log';
const MAX_SIZE_BYTES = 1024 * 1024;
const LINES_TO_DROP = 100;

// Five fixed categories, so a scan of the log (or a filter in Notepad/Excel) can tell at a glance
// what happened without reading every message: NETWORK for any request/response outcome (success
// or failure) against an outside source, ERROR for the app's own bugs/crashes, WARNING for a
// degraded-but-recovered-from state (missing config, an empty/stale source), ALERT for a real
// siren actually starting or ending (as opposed to app lifecycle or a merely-forecast one - those
// stay INFO), and INFO for everything else (lifecycle, user actions). Falls back to INFO for an
// unrecognized level rather than throwing, since a bad level string shouldn't be able to take the
// log itself down.
const LOG_LEVELS = ['INFO', 'WARNING', 'ERROR', 'NETWORK', 'ALERT'];

function csvField(value) {
    const str = String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Excel's own double-click-to-open ignores the file's actual delimiter and splits columns on
// whatever the SYSTEM locale's list separator is - often ";", not ",", on this app's own primary
// locale - so without this hint every row silently landed in one single column instead of a real
// table. This exact "sep=,\r\n" first line is a documented Excel-specific override that forces it
// to use a comma regardless of locale; everything else that might read this file (Notepad, this
// app's own log viewer, a person) just sees one harmless extra line above the header.
const SEP_DIRECTIVE = 'sep=,';
const HEADER = 'Date,Time,Level,Event';
const OLD_HEADER = 'Date,Time,Event';
const PREAMBLE = SEP_DIRECTIVE + os.EOL + HEADER;

function initializeLogFile() {
    const filePath = getUserDataFile(LOG_FILE);

    if (!fs.existsSync(filePath)) {
        // An install updated from before the log used a .csv extension left its history under the
        // old name - renamed forward rather than started fresh, so that history isn't just lost.
        const oldFilePath = getUserDataFile(OLD_LOG_FILE);
        if (fs.existsSync(oldFilePath)) {
            fs.renameSync(oldFilePath, filePath);
        } else {
            fs.writeFileSync(filePath, PREAMBLE + os.EOL, 'utf-8');
            return;
        }
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.startsWith(SEP_DIRECTIVE)) return;

    // An install updated from before either the Level column or this sep= line existed - either
    // way, the existing header line (whichever of the two it is) gets replaced by the current
    // two-line preamble above; the actual data rows below it are untouched.
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

// ISO-style (YYYY-MM-DD, 24-hour HH:MM:SS) rather than any particular locale's own date format -
// unambiguous and sorts correctly as plain text, which a locale-formatted date/time doesn't.
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
    // Transliterated here, once, for every message regardless of call site - a location name
    // pulled straight from Neptun/alerts.in.ua data (no English variant available at all, e.g. a
    // brand new "discovered" location, or one of the handful Neptun names that don't map to
    // anything) would otherwise leave Cyrillic in the log. Idempotent on already-Latin text, so
    // messages that never had any Cyrillic in the first place pass through unchanged.
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

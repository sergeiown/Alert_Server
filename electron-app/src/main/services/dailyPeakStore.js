// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');

const TODAY_STATS_TIMEZONE = 'Europe/Kyiv';
const STATE_FILE = 'daily_peak_state.json';

let state = null;

function kyivDateStr(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TODAY_STATS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function loadState() {
    const filePath = getUserDataFile(STATE_FILE);
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        return null;
    }
}

function saveState() {
    fs.writeFileSync(getUserDataFile(STATE_FILE), JSON.stringify(state), 'utf-8');
}

function ensureToday() {
    const today = kyivDateStr(new Date());
    if (!state) state = loadState() || { date: today, alertPeak: 0, threatPeak: 0 };
    if (state.date !== today) state = { date: today, alertPeak: 0, threatPeak: 0 };
}

function recordAlertCount(count) {
    ensureToday();
    if (count > state.alertPeak) {
        state.alertPeak = count;
        saveState();
    }
}

function recordThreatCount(count) {
    ensureToday();
    if (count > state.threatPeak) {
        state.threatPeak = count;
        saveState();
    }
}

function getDailyPeaks() {
    ensureToday();
    return { alertPeak: state.alertPeak, threatPeak: state.threatPeak };
}

module.exports = { recordAlertCount, recordThreatCount, getDailyPeaks };

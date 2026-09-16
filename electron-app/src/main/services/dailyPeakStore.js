// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const TODAY_STATS_TIMEZONE = 'Europe/Kyiv';

let state = { date: null, alertPeak: 0, threatPeak: 0 };

function kyivDateStr(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TODAY_STATS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function ensureToday() {
    const today = kyivDateStr(new Date());
    if (state.date !== today) state = { date: today, alertPeak: 0, threatPeak: 0 };
}

function recordAlertCount(count) {
    ensureToday();
    if (count > state.alertPeak) state.alertPeak = count;
}

function recordThreatCount(count) {
    ensureToday();
    if (count > state.threatPeak) state.threatPeak = count;
}

function getDailyPeaks() {
    ensureToday();
    return { alertPeak: state.alertPeak, threatPeak: state.threatPeak };
}

module.exports = { recordAlertCount, recordThreatCount, getDailyPeaks };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const store = require('./store');
const lib = require('./lib');
const archive = require('./archive');

const PEAKS_KEY = 'dailyPeaks';
const BACKFILL_KEY = 'historyBackfill';
const BACKFILL_COMPLETE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TODAY_CACHE_TTL_MS = 30 * 1000;

let peaks = null;
let todayCache = null;

function currentPeaks() {
    const today = lib.kyivDateKey(new Date());
    if (!peaks) peaks = store.get(PEAKS_KEY);
    if (!peaks || peaks.date !== today) peaks = { date: today, alertPeak: 0, threatPeak: 0 };
    return peaks;
}

function recordAlertCount(count) {
    const state = currentPeaks();
    if (count > state.alertPeak) {
        state.alertPeak = count;
        store.put(PEAKS_KEY, state);
    }
}

function recordThreatCount(count) {
    const state = currentPeaks();
    if (count > state.threatPeak) {
        state.threatPeak = count;
        store.put(PEAKS_KEY, state);
    }
}

function getDailyPeaks() {
    const state = currentPeaks();
    return { date: state.date, alertPeak: state.alertPeak, threatPeak: state.threatPeak };
}

function markBackfillDone() {
    store.put(BACKFILL_KEY, { completedAt: Date.now() });
}

function isBackfillComplete() {
    const state = store.get(BACKFILL_KEY);
    return Boolean(state && Date.now() - state.completedAt < BACKFILL_COMPLETE_MAX_AGE_MS);
}

function computeToday() {
    const today = lib.kyivDateKey(new Date());
    const dayBefore = lib.kyivDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const alerts = archive
        .getAlertsFromDay(dayBefore)
        .filter((alert) => !alert.deleted_at && alert.started_at && lib.kyivDateKey(new Date(alert.started_at)) === today);

    const byHour = Array.from({ length: 24 }, () => 0);
    const byOblast = new Map();
    alerts.forEach((alert) => {
        byHour[lib.kyivHour(alert.started_at)]++;
        if (alert.location_oblast) byOblast.set(alert.location_oblast, (byOblast.get(alert.location_oblast) || 0) + 1);
    });

    return { date: today, alerts, byHour, byOblast };
}

function getTodayStats(monitoredUids) {
    if (!todayCache || Date.now() - todayCache.at >= TODAY_CACHE_TTL_MS || todayCache.data.date !== lib.kyivDateKey(new Date())) {
        todayCache = { at: Date.now(), data: computeToday() };
    }
    const { date, alerts, byHour, byOblast } = todayCache.data;

    const monitored = new Set((monitoredUids || []).map(String));
    const byLocation = new Map();
    alerts.forEach((alert) => {
        if (alert.location_uid && monitored.has(String(alert.location_uid))) {
            const label = alert.location_title || String(alert.location_uid);
            byLocation.set(label, (byLocation.get(label) || 0) + 1);
        }
    });

    const complete = isBackfillComplete();
    return {
        date,
        total: alerts.length,
        byHour,
        byOblast: Array.from(byOblast, ([oblast, count]) => ({ oblast, count })).sort((a, b) => b.count - a.count),
        byMonitoredLocation: Array.from(byLocation, ([location, count]) => ({ location, count })).sort((a, b) => b.count - a.count),
        complete,
        warmupEtaMinutes: complete ? 0 : 15,
        source: 'alerts.in.ua',
    };
}

module.exports = { recordAlertCount, recordThreatCount, getDailyPeaks, markBackfillDone, isBackfillComplete, getTodayStats };

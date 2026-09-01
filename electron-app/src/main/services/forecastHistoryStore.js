// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');

const STORE_FILE = 'forecast_history.json';
const DEBOUNCE_MS = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Retention target: about 2 years of history. The forecast model itself only looks at the last
// roughly 90 days (baseline) plus a bit for rare alert types, so this is purely a local-storage cap, not
// a modeling constraint - it just stops the file from growing forever over a years-long install.
const MAX_HISTORY_AGE_MS = 730 * DAY_MS;

let store = null;
let writeTimer = null;

function backfillFirstSeen() {
    const now = Date.now();
    let changed = false;
    Object.values(store).forEach((region) => {
        Object.values(region).forEach((alert) => {
            if (alert._localFirstSeenAt === undefined) {
                alert._localFirstSeenAt = now;
                changed = true;
            }
        });
    });
    return changed;
}

// Drops alerts older than MAX_HISTORY_AGE_MS from one region. Alerts with an unparseable
// started_at are left alone rather than guessed at.
function pruneRegion(region, now) {
    let changed = false;
    Object.keys(region).forEach((id) => {
        const startedAtMs = new Date(region[id].started_at).getTime();
        if (!Number.isNaN(startedAtMs) && now - startedAtMs > MAX_HISTORY_AGE_MS) {
            delete region[id];
            changed = true;
        }
    });
    return changed;
}

function pruneAll() {
    const now = Date.now();
    let changed = false;
    Object.values(store).forEach((region) => {
        if (pruneRegion(region, now)) changed = true;
    });
    return changed;
}

function load() {
    const filePath = getUserDataFile(STORE_FILE);
    if (!fs.existsSync(filePath)) {
        store = {};
        return store;
    }

    try {
        store = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        store = {};
    }

    // Written synchronously (not debounced) so these migrations survive even if the app quits
    // moments after startup, instead of silently re-running on every restart.
    const backfilled = backfillFirstSeen();
    const pruned = pruneAll();
    if (backfilled || pruned) writeNow();

    return store;
}

function ensureLoaded() {
    if (!store) load();
}

function writeNow() {
    if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
    }
    fs.writeFileSync(getUserDataFile(STORE_FILE), JSON.stringify(store), 'utf-8');
}

function scheduleWrite() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(writeNow, DEBOUNCE_MS);
}

// `backfill: true` stamps _localFirstSeenAt from the alert's own started_at instead of "now" -
// only for a deliberate, known-genuine historical import (historyBackfillStore.js's one-time
// past-month pull), where the data really is that old and getStats()'s spanDays should say so
// immediately. Never for the normal day-to-day merge path (todayStatsStore.js, forecast.js's own
// on-demand fetches) - there, "now" is the deliberately conservative choice explained above
// (an API answering with old-looking alerts shouldn't make a fresh install claim years of history).
//
// `source` (e.g. 'ukrainealarm' | 'alerts.in.ua') is stamped on each merged alert as
// `_localSource` - tagged at the point of collection, by every merge call site (todayStatsStore.js,
// historyBackfillStore.js, forecast.js's own on-demand fetch), rather than tracked separately by
// whichever caller happened to fetch most recently. getRegionSource() below reads it back from
// the data actually present, instead of a side-channel that only reflected one narrow fetch path
// and needed its own extra "keep it fresh" network call to stay meaningful.
function mergeAlerts(uid, alerts, { backfill = false, source = null } = {}) {
    ensureLoaded();
    const key = String(uid);
    if (!store[key]) store[key] = {};
    const region = store[key];

    let changed = false;
    const now = Date.now();
    alerts.forEach((alert) => {
        const existing = region[alert.id];
        const existingStamp = existing ? new Date(existing.updated_at || existing.started_at).getTime() : -Infinity;
        const incomingStamp = new Date(alert.updated_at || alert.started_at).getTime();

        if (incomingStamp >= existingStamp) {
            const firstSeenAt = existing?._localFirstSeenAt ?? (backfill ? new Date(alert.started_at).getTime() : now);
            region[alert.id] = { ...alert, _localFirstSeenAt: firstSeenAt, _localSource: source ?? existing?._localSource ?? null };
            changed = true;
        }
    });

    if (pruneRegion(region, now)) changed = true;
    if (changed) scheduleWrite();
}

// The source of the most recently STARTED alert on file for this region (not the most recently
// merged - a backfill pass can touch old alerts long after the fact) - the best available signal
// for "which source is this region's forecast currently reflecting", without a dedicated live
// query just to answer that question.
function getRegionSource(uid) {
    ensureLoaded();
    const region = store[String(uid)];
    if (!region) return null;

    const alerts = Object.values(region).filter((alert) => alert._localSource);
    if (!alerts.length) return null;

    const latest = alerts.reduce((a, b) => (new Date(a.started_at) >= new Date(b.started_at) ? a : b));
    return latest._localSource;
}

function getAllAlertsForRegion(uid) {
    ensureLoaded();
    const region = store[String(uid)];
    return region ? Object.values(region) : [];
}

function getStats() {
    ensureLoaded();
    let totalAlerts = 0;
    let oldestMs = null;
    let newestMs = null;
    let oldestLocalMs = null;
    const regionCount = Object.keys(store).length;

    Object.values(store).forEach((region) => {
        Object.values(region).forEach((alert) => {
            totalAlerts++;
            const startedAtMs = new Date(alert.started_at).getTime();
            if (oldestMs === null || startedAtMs < oldestMs) oldestMs = startedAtMs;
            if (newestMs === null || startedAtMs > newestMs) newestMs = startedAtMs;

            const firstSeenMs = alert._localFirstSeenAt ?? startedAtMs;
            if (oldestLocalMs === null || firstSeenMs < oldestLocalMs) oldestLocalMs = firstSeenMs;
        });
    });

    // Based on _localFirstSeenAt, not the oldest alert's started_at - the API can return alerts
    // far older than 30 days, which would otherwise make a fresh install look like it had years
    // of local history.
    const spanDays = oldestLocalMs !== null ? Math.ceil((Date.now() - oldestLocalMs) / DAY_MS) : 0;

    return {
        regionCount,
        totalAlerts,
        oldestDate: oldestMs !== null ? new Date(oldestMs).toISOString() : null,
        newestDate: newestMs !== null ? new Date(newestMs).toISOString() : null,
        spanDays,
    };
}

function clearAll() {
    store = {};
    writeNow();
}

module.exports = { mergeAlerts, getAllAlertsForRegion, getRegionSource, getStats, clearAll };

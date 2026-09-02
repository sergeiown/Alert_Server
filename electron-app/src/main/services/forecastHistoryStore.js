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
// UkraineAlarm and alerts.in.ua both report the very same real-world alert independently - when
// UkraineAlarm's own flakiness (confirmed separately, roughly half of regionHistory/dateHistory
// calls fail) makes a merge fall back to alerts.in.ua, that fallback pulls the whole past month
// again, alerts.in.ua's own ids for the very same alerts UkraineAlarm already recorded included.
// Since the two sources use unrelated id schemes, they never collide on `alert.id` and both copies
// end up stored permanently side by side - confirmed on real data (Sumy oblast: 629 of 651
// UkraineAlarm-sourced alerts had an alerts.in.ua-sourced near-duplicate within 5 seconds),
// roughly doubling the apparent alert count and dragging every rate/probability derived from it
// up with it. A same-type alert starting within this window of one already on file is therefore
// treated as the same real event, not a second one - regardless of which source reported which.
const CROSS_SOURCE_DEDUP_WINDOW_MS = 60 * 1000;

let store = null;
let writeTimer = null;

// Finds an existing record in `region` of the same alert type starting within
// CROSS_SOURCE_DEDUP_WINDOW_MS of `alert` - the earlier of the two if there's a tie - excluding
// `excludeId` itself (so re-checking an alert against its own already-stored record is a no-op).
function findNearDuplicateId(region, alert, excludeId) {
    const incomingMs = new Date(alert.started_at).getTime();
    if (Number.isNaN(incomingMs)) return null;

    let bestId = null;
    let bestMs = null;
    Object.entries(region).forEach(([id, existing]) => {
        if (id === excludeId || existing.alert_type !== alert.alert_type) return;
        const existingMs = new Date(existing.started_at).getTime();
        if (Number.isNaN(existingMs) || Math.abs(existingMs - incomingMs) > CROSS_SOURCE_DEDUP_WINDOW_MS) return;
        if (bestId === null || existingMs < bestMs) {
            bestId = id;
            bestMs = existingMs;
        }
    });
    return bestId;
}

// One-time cleanup for duplicates merged in before this fix existed - collapses each cluster of
// same-type, near-simultaneous records (regardless of source) down to the earliest one, the same
// rule mergeAlerts now applies going forward.
function dedupeCrossSourceRegion(region) {
    let changed = false;
    const byType = new Map();
    Object.entries(region).forEach(([id, alert]) => {
        if (!byType.has(alert.alert_type)) byType.set(alert.alert_type, []);
        byType.get(alert.alert_type).push([id, alert]);
    });

    byType.forEach((entries) => {
        entries.sort((a, b) => new Date(a[1].started_at) - new Date(b[1].started_at));
        let clusterStartMs = null;
        let clusterKeepId = null;
        entries.forEach(([id, alert]) => {
            const t = new Date(alert.started_at).getTime();
            if (Number.isNaN(t)) return;
            if (clusterStartMs === null || t - clusterStartMs > CROSS_SOURCE_DEDUP_WINDOW_MS) {
                clusterStartMs = t;
                clusterKeepId = id;
                return;
            }
            // Same cluster as clusterKeepId - keep whichever of the two has the earlier
            // _localFirstSeenAt (the one genuinely collected first), drop the other.
            const kept = region[clusterKeepId];
            if ((alert._localFirstSeenAt ?? Infinity) < (kept._localFirstSeenAt ?? Infinity)) {
                delete region[clusterKeepId];
                clusterKeepId = id;
            } else {
                delete region[id];
            }
            changed = true;
        });
    });

    return changed;
}

function dedupeCrossSourceAll() {
    let changed = false;
    Object.values(store).forEach((region) => {
        if (dedupeCrossSourceRegion(region)) changed = true;
    });
    return changed;
}

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
    const deduped = dedupeCrossSourceAll();
    if (backfilled || pruned || deduped) writeNow();

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
        // Not already on file under its own id - before treating it as a genuinely new alert,
        // check whether the other source already reported this same real event a moment ago
        // (see CROSS_SOURCE_DEDUP_WINDOW_MS above). If so, this is that same alert seen again
        // under a different id, not a second one - skip it entirely rather than double-count it.
        if (!region[alert.id] && findNearDuplicateId(region, alert, alert.id)) return;

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

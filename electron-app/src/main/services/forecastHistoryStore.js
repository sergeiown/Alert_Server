// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');

const STORE_FILE = 'forecast_history.json';
const DEBOUNCE_MS = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_HISTORY_AGE_MS = 730 * DAY_MS;

const CROSS_SOURCE_DEDUP_WINDOW_MS = 60 * 1000;

let store = null;
let writeTimer = null;

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

function mergeAlerts(uid, alerts, { backfill = false, source = null } = {}) {
    ensureLoaded();
    const key = String(uid);
    if (!store[key]) store[key] = {};
    const region = store[key];

    let changed = false;
    const now = Date.now();
    alerts.forEach((alert) => {

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

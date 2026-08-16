const fs = require('fs');
const { getUserDataFile } = require('./appPaths');

const STORE_FILE = 'forecast_history.json';
const DEBOUNCE_MS = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

    // One-time migration for stores written before _localFirstSeenAt existed - stamps everything
    // still missing it "now" in a single pass rather than waiting for each region's next re-poll,
    // so the reported span is immediately consistent instead of trailing whichever region hasn't
    // refreshed yet.
    if (backfillFirstSeen()) scheduleWrite();

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

function mergeAlerts(uid, alerts) {
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
            region[alert.id] = { ...alert, _localFirstSeenAt: existing?._localFirstSeenAt ?? now };
            changed = true;
        }
    });

    if (changed) scheduleWrite();
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

    // spanDays reflects how long this install has actually been accumulating alerts locally
    // (tracked via _localFirstSeenAt on first merge), not how old the oldest alert event itself
    // is - the API can return alerts far older than 30 days for some regions, which would
    // otherwise make a fresh install look like it had years of local history.
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

module.exports = { mergeAlerts, getAllAlertsForRegion, getStats, clearAll };

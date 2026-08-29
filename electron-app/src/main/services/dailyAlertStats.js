// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');

const STORE_FILE = 'daily_alert_stats.json';
const DEBOUNCE_MS = 1000;

let state = null;
let writeTimer = null;

function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function freshState() {
    return { date: localDateKey(new Date()), seenIds: [], records: [] };
}

function load() {
    const filePath = getUserDataFile(STORE_FILE);
    let saved = null;

    if (fs.existsSync(filePath)) {
        try {
            saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (err) {
            saved = null;
        }
    }

    const today = localDateKey(new Date());
    state = saved && saved.date === today ? saved : freshState();
}

function writeNow() {
    if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
    }
    fs.writeFileSync(getUserDataFile(STORE_FILE), JSON.stringify(state), 'utf-8');
}

function scheduleWrite() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(writeNow, DEBOUNCE_MS);
}

// Rolls over to a new day's empty records on the first touch after midnight, even for a tray
// session that's been running since before it - nothing here depends on the app having restarted.
function ensureLoaded() {
    if (!state) {
        load();
        return;
    }
    const today = localDateKey(new Date());
    if (state.date !== today) {
        state = freshState();
        writeNow();
    }
}

// Records one lightweight entry per distinct nationwide alert whose own started_at falls on
// today's (local) date - not every alert currently active, since one that started yesterday and
// is still ongoing isn't a "new today" alert. Only what the Trends "Today" tab's breakdowns need
// (hour, oblast, the specific location) - not the full alert object.
function recordAlerts(alerts) {
    ensureLoaded();
    let changed = false;

    alerts.forEach((alert) => {
        if (!alert.started_at) return;
        const startedAt = new Date(alert.started_at);
        if (localDateKey(startedAt) !== state.date) return;

        const key = String(alert.id);
        if (state.seenIds.includes(key)) return;

        state.seenIds.push(key);
        state.records.push({
            hour: startedAt.getHours(),
            oblast: alert.location_oblast || null,
            locationUid: alert.location_uid !== undefined ? String(alert.location_uid) : null,
            locationTitle: alert.location_title || null,
        });
        changed = true;
    });

    if (changed) scheduleWrite();
}

// monitoredUids is passed in rather than read from regionsStore here, so this module stays a
// plain data store with no dependency on which regions are currently selected - the caller (an
// IPC handler, typically) already has that and can pass whatever is current right now, even if
// the selection changed since some of today's alerts were recorded.
function getTodayStats(monitoredUids) {
    ensureLoaded();
    const monitored = new Set((monitoredUids || []).map(String));

    const byHour = Array.from({ length: 24 }, () => 0);
    const byOblast = new Map();
    const byMonitoredLocation = new Map();

    state.records.forEach((record) => {
        byHour[record.hour]++;

        if (record.oblast) {
            byOblast.set(record.oblast, (byOblast.get(record.oblast) || 0) + 1);
        }

        if (record.locationUid && monitored.has(record.locationUid)) {
            const label = record.locationTitle || record.locationUid;
            byMonitoredLocation.set(label, (byMonitoredLocation.get(label) || 0) + 1);
        }
    });

    return {
        total: state.records.length,
        byHour,
        byOblast: Array.from(byOblast, ([oblast, count]) => ({ oblast, count })).sort((a, b) => b.count - a.count),
        byMonitoredLocation: Array.from(byMonitoredLocation, ([location, count]) => ({ location, count })).sort(
            (a, b) => b.count - a.count
        ),
    };
}

module.exports = { recordAlerts, getTodayStats };

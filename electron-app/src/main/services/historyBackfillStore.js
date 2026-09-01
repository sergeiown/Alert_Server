// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

// One-time (well, one-per-missing-day) nationwide history import via UkraineAlarm's dateHistory -
// forecastHistoryStore.js's own spanDays only reflects how long THIS install has been locally
// accumulating data (days since _localFirstSeenAt), not how far back real alert data actually
// goes; without this, a fresh install (or one that just added todayStatsStore's nationwide
// backfill) starts the forecast model off with only a few days of real history, even though a
// month of real data is available for the asking. Merged into the exact same historyStore
// forecast.js/todayStatsStore.js already read from - no separate wiring needed for the forecast
// model to actually use it.

const fs = require('fs');
const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const { getLocationLookup } = require('./locationFilter');
const { getUserDataFile } = require('./appPaths');
const historyStore = require('./forecastHistoryStore');

const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';
const BACKFILL_DAYS = 30;
const TIMEZONE = 'Europe/Kyiv';
// Gentle pacing between the up-to-30 one-time requests - regionHistory's own real, roughly 50% failure
// rate (see data-flow-notes.txt) suggests this API can be flaky under any load; no reason to rush
// a one-time background job that isn't blocking anything the user is looking at.
const REQUEST_GAP_MS = 3000;
const STARTUP_DELAY_MS = 15000;
const STATE_FILE = 'historical_backfill_state.json';

function kyivDateKey(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(date);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function targetDateKeys() {
    const todayKey = kyivDateKey(new Date());
    const keys = [];
    for (let i = 1; i <= BACKFILL_DAYS; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = kyivDateKey(date);
        if (key !== todayKey) keys.push(key);
    }
    return keys;
}

function loadState() {
    const filePath = getUserDataFile(STATE_FILE);
    if (!fs.existsSync(filePath)) return { completedDates: [] };
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        return { completedDates: [] };
    }
}

function saveState(state) {
    fs.writeFileSync(getUserDataFile(STATE_FILE), JSON.stringify(state, null, 2), 'utf-8');
}

// Same nationwide uid+oblast fan-out todayStatsStore.js's mergeIntoForecastHistory already does -
// duplicated rather than imported since backfill:true only belongs here, never on the live path.
function mergeNationwide(alerts) {
    const lookup = getLocationLookup();
    const byOblast = new Map();
    const byLocation = new Map();

    alerts.forEach((alert) => {
        if (alert.location_uid === undefined || alert.location_uid === null) return;
        const locationUid = String(alert.location_uid);

        if (!byLocation.has(locationUid)) byLocation.set(locationUid, []);
        byLocation.get(locationUid).push(alert);

        const info = lookup.get(locationUid);
        if (info && info.stateUid !== undefined) {
            const oblastKey = String(info.stateUid);
            if (!byOblast.has(oblastKey)) byOblast.set(oblastKey, []);
            byOblast.get(oblastKey).push(alert);
        }
    });

    byOblast.forEach((list, uid) => historyStore.mergeAlerts(uid, list, { backfill: true, source: 'ukrainealarm' }));
    byLocation.forEach((list, uid) => historyStore.mergeAlerts(uid, list, { backfill: true, source: 'ukrainealarm' }));
}

async function runBackfill() {
    const { alertProxyClientKey } = loadLocalConfig();
    if (!alertProxyClientKey) return;

    const state = loadState();
    const completed = new Set(state.completedDates);
    const missing = targetDateKeys().filter((key) => !completed.has(key));
    if (!missing.length) return;

    let totalAlerts = 0;
    let succeededNow = 0;

    for (const dateKey of missing) {
        try {
            const response = await fetch(`${PROXY_URL}/ukrainealarm-date-stats/${dateKey.replace(/-/g, '')}`, {
                headers: { 'X-Client-Key': alertProxyClientKey },
            });

            if (response.ok) {
                const data = await response.json();
                if (data && Array.isArray(data.alerts)) {
                    mergeNationwide(data.alerts);
                    totalAlerts += data.alerts.length;
                    succeededNow++;
                    completed.add(dateKey);
                    saveState({ completedDates: Array.from(completed) });
                }
            }
        } catch (err) {
            // Left out of `completed` - retried on a future app start along with any other
            // still-missing day, no special handling needed here.
        }

        await delay(REQUEST_GAP_MS);
    }

    const stillMissing = targetDateKeys().length - completed.size;
    logEvent(
        `Historical backfill (UkraineAlarm): ${succeededNow}/${missing.length} days fetched this run (${totalAlerts} alerts), ${stillMissing} day(s) still missing overall`,
        'NETWORK'
    );
}

function startHistoryBackfill() {
    setTimeout(() => {
        runBackfill().catch((err) => logEvent(`Historical backfill failed: ${err.message}`, 'NETWORK'));
    }, STARTUP_DELAY_MS);
}

module.exports = { startHistoryBackfill };

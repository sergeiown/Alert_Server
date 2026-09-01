// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const { getLocationLookup } = require('./locationFilter');
const historyStore = require('./forecastHistoryStore');

const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TODAY_STATS_TIMEZONE = 'Europe/Kyiv';

let cached = null;

function kyivHour(dateStr) {
    const formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone: TODAY_STATS_TIMEZONE,
        hour: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(dateStr));
    return Number(formatted);
}

// UkraineAlarm's dateHistory only gives location_uid/location_title, not the oblast name
// alerts.in.ua's own today-stats already carries - resolved here via the same static/discovered
// location lookup mergeIntoForecastHistory below already relies on.
function resolveOblastName(locationUid) {
    const lookup = getLocationLookup();
    const info = lookup.get(String(locationUid));
    if (!info) return null;
    const state = lookup.get(String(info.stateUid));
    return state ? state.name : null;
}

// Builds the same {total, byHour, byOblast, alerts, complete, warmupEtaMinutes} shape the
// alerts.in.ua-based /today-stats endpoint already returns server-side - UkraineAlarm's
// dateHistory only needs this done client-side, once, since it isn't pre-aggregated by the proxy.
function aggregateTodayStats(date, alerts) {
    const byHour = Array.from({ length: 24 }, () => 0);
    const byOblast = new Map();

    alerts.forEach((alert) => {
        byHour[kyivHour(alert.started_at)]++;
        const oblastName = resolveOblastName(alert.location_uid);
        if (oblastName) byOblast.set(oblastName, (byOblast.get(oblastName) || 0) + 1);
    });

    return {
        date,
        total: alerts.length,
        byHour,
        byOblast: Array.from(byOblast, ([oblast, count]) => ({ oblast, count })).sort((a, b) => b.count - a.count),
        alerts,
        complete: true,
        warmupEtaMinutes: 0,
        source: 'ukrainealarm',
    };
}

// The response already carries every alert nationwide for today - folded into the same local,
// indefinitely-retained history forecast.js itself builds up, under both the oblast-level bucket
// (matches what a whole-oblast tracked region reads) and each alert's own specific location_uid
// (matches a city/raion/hromada tracked directly) - so a region added to monitoring later already
// has today's data on day one, instead of only accumulating from whenever it was first tracked.
function mergeIntoForecastHistory(alerts, source) {
    // alerts.in.ua's own location_oblast_uid field just mirrors location_uid on these records
    // (not the oblast's real uid) - the real one comes from the same static location lookup
    // getHistoryFetchTarget() itself resolves through, keyed off the alert's own location_uid.
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

    byOblast.forEach((list, uid) => historyStore.mergeAlerts(uid, list, { source }));
    byLocation.forEach((list, uid) => historyStore.mergeAlerts(uid, list, { source }));
}

// Preferred source: one dateHistory request for the whole day, complete immediately - no
// per-oblast warmup wait. Returns whether it actually got usable data, so refresh() knows whether
// to fall back.
async function refreshFromUkraineAlarm(clientKey) {
    try {
        const response = await fetch(`${PROXY_URL}/ukrainealarm-today-stats`, {
            headers: { 'X-Client-Key': clientKey },
        });
        if (!response.ok) {
            logEvent(`Today-stats fetch failed (UkraineAlarm via alert-proxy): ${response.status}`, 'NETWORK');
            return false;
        }

        const data = await response.json();
        if (!data || !Array.isArray(data.alerts)) {
            logEvent('Today-stats response missing expected fields (UkraineAlarm via alert-proxy)', 'WARNING');
            return false;
        }

        cached = aggregateTodayStats(data.date, data.alerts);
        mergeIntoForecastHistory(data.alerts, 'ukrainealarm');
        logEvent(`Today-stats updated (UkraineAlarm, ${data.date}): ${cached.total} nationwide`, 'NETWORK');
        return true;
    } catch (err) {
        logEvent(`Today-stats fetch error (UkraineAlarm via alert-proxy): ${err.message}`, 'NETWORK');
        return false;
    }
}

// Fallback: the existing alerts.in.ua-based nationwide backfill (slow per-oblast warmup, but
// well-proven) - used only when UkraineAlarm's own today-stats couldn't be fetched.
async function refreshFromAlertsInUa(clientKey) {
    try {
        const response = await fetch(`${PROXY_URL}/today-stats`, {
            headers: { 'X-Client-Key': clientKey },
        });
        if (!response.ok) {
            logEvent(`Today-stats fetch failed (alerts.in.ua via alert-proxy): ${response.status}`, 'NETWORK');
            return;
        }

        const data = await response.json();
        // Before the Worker has this route deployed, /today-stats falls through to its default
        // handler (the active-alerts endpoint) and still answers 200 with unrelated JSON - this
        // guards against caching that as if it were real today-stats.
        if (!data || typeof data.total !== 'number' || !Array.isArray(data.byHour) || !Array.isArray(data.alerts)) {
            logEvent('Today-stats response missing expected fields (alert-proxy - Worker not deployed yet?)', 'WARNING');
            return;
        }

        cached = { ...data, source: 'alerts.in.ua' };
        mergeIntoForecastHistory(data.alerts, 'alerts.in.ua');
        logEvent(`Today-stats updated (alerts.in.ua, ${data.date}): ${data.total} nationwide`, 'NETWORK');
    } catch (err) {
        logEvent(`Today-stats fetch error (alerts.in.ua via alert-proxy): ${err.message}`, 'NETWORK');
    }
}

async function refresh() {
    const { alertProxyClientKey } = loadLocalConfig();
    if (!alertProxyClientKey) return;

    const gotUkraineAlarmData = await refreshFromUkraineAlarm(alertProxyClientKey);
    if (!gotUkraineAlarmData) await refreshFromAlertsInUa(alertProxyClientKey);
}

// null when never successfully fetched yet (fresh start, or the proxy currently unreachable) -
// the renderer shows a "no data" state rather than a locally-tallied, silently-partial number.
function getLatestTodayStats(monitoredUids) {
    if (!cached) return null;

    const monitored = new Set((monitoredUids || []).map(String));
    const byMonitoredLocation = new Map();
    cached.alerts.forEach((alert) => {
        const uid = alert.location_uid !== undefined ? String(alert.location_uid) : null;
        if (uid && monitored.has(uid)) {
            const label = alert.location_title || uid;
            byMonitoredLocation.set(label, (byMonitoredLocation.get(label) || 0) + 1);
        }
    });

    return {
        total: cached.total,
        byHour: cached.byHour,
        byOblast: cached.byOblast,
        byMonitoredLocation: Array.from(byMonitoredLocation, ([location, count]) => ({ location, count })).sort(
            (a, b) => b.count - a.count
        ),
        complete: cached.complete,
        warmupEtaMinutes: cached.warmupEtaMinutes,
        source: cached.source,
    };
}

// A small buffer past midnight, not exactly on it - gives the proxy's own day rollover (which
// only actually happens the moment something calls into it) a moment to have already landed by
// the time this request arrives, rather than racing it.
const MIDNIGHT_REFRESH_BUFFER_MS = 5000;

function msUntilNextLocalMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return next.getTime() - now.getTime() + MIDNIGHT_REFRESH_BUFFER_MS;
}

// The periodic interval alone left up to REFRESH_INTERVAL_MS of showing yesterday's total as
// "today" right after midnight (proxy itself rolls over immediately - confirmed live - but the
// client only finds out on its next scheduled poll). This forces a refresh right at the boundary
// instead of waiting on that timer.
function scheduleMidnightRefresh() {
    setTimeout(() => {
        refresh();
        scheduleMidnightRefresh();
    }, msUntilNextLocalMidnight());
}

function startTodayStatsRefresh() {
    refresh();
    setInterval(refresh, REFRESH_INTERVAL_MS);
    scheduleMidnightRefresh();
}

module.exports = { startTodayStatsRefresh, getLatestTodayStats };

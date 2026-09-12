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

function kyivDateStr(dateStr) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TODAY_STATS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(dateStr));
}

function resolveOblastName(locationUid) {
    const lookup = getLocationLookup();
    const info = lookup.get(String(locationUid));
    if (!info) return null;
    const state = lookup.get(String(info.stateUid));
    return state ? state.name : null;
}

function aggregateTodayStats(date, rawAlerts) {

    const alerts = rawAlerts.filter((alert) => kyivDateStr(alert.started_at) === date);

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

function mergeIntoForecastHistory(alerts, source) {

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

async function refreshFromUkraineAlarm(clientKey) {
    try {
        const response = await fetch(`${PROXY_URL}/ukrainealarm-today-stats`, {
            headers: { 'X-Client-Key': clientKey },
        });
        if (!response.ok) {
            logEvent(`Today stats fetch failed (UkraineAlarm via alert-proxy): ${response.status}`, 'NETWORK');
            return false;
        }

        const data = await response.json();
        if (!data || !Array.isArray(data.alerts)) {
            logEvent('Today stats response missing expected fields (UkraineAlarm via alert-proxy)', 'WARNING');
            return false;
        }

        cached = aggregateTodayStats(data.date, data.alerts);
        mergeIntoForecastHistory(data.alerts, 'ukrainealarm');
        logEvent(`Today stats updated (UkraineAlarm): ${cached.total} nationwide (${data.date})`, 'NETWORK');
        return true;
    } catch (err) {
        logEvent(`Today stats fetch error (UkraineAlarm via alert-proxy): ${err.message}`, 'NETWORK');
        return false;
    }
}

async function refreshFromAlertsInUa(clientKey) {
    try {
        const response = await fetch(`${PROXY_URL}/today-stats`, {
            headers: { 'X-Client-Key': clientKey },
        });
        if (!response.ok) {
            logEvent(`Today stats fetch failed (alerts.in.ua via alert-proxy): ${response.status}`, 'NETWORK');
            return;
        }

        const data = await response.json();

        if (!data || typeof data.total !== 'number' || !Array.isArray(data.byHour) || !Array.isArray(data.alerts)) {
            logEvent('Today stats response missing expected fields (alert-proxy - Worker not deployed yet?)', 'WARNING');
            return;
        }

        cached = { ...data, source: 'alerts.in.ua' };
        mergeIntoForecastHistory(data.alerts, 'alerts.in.ua');
        logEvent(`Today stats updated (alerts.in.ua): ${data.total} nationwide (${data.date})`, 'NETWORK');
    } catch (err) {
        logEvent(`Today stats fetch error (alerts.in.ua via alert-proxy): ${err.message}`, 'NETWORK');
    }
}

async function refresh() {
    const { alertProxyClientKey } = loadLocalConfig();
    if (!alertProxyClientKey) return;

    const gotUkraineAlarmData = await refreshFromUkraineAlarm(alertProxyClientKey);
    if (!gotUkraineAlarmData) await refreshFromAlertsInUa(alertProxyClientKey);
}

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

const MIDNIGHT_REFRESH_BUFFER_MS = 5000;

function msUntilNextLocalMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return next.getTime() - now.getTime() + MIDNIGHT_REFRESH_BUFFER_MS;
}

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

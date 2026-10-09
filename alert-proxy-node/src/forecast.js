// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const archive = require('./archive');
const lib = require('./lib');
const model = require('./forecastModel');
const forecastConfig = require('./forecastConfig');
const states = require('../resources/states.json');

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 60 * 1000;
const MAX_HISTORY_AGE_MS = 730 * DAY_MS;
const CACHE_MAX_ENTRIES = 500;

const cache = new Map();

function durationStats(usableAlerts, nowMs) {
    const avgOf = (list) => (list.length ? list.reduce((sum, a) => sum + a._durationMs, 0) / list.length : null);
    const types = [...new Set(usableAlerts.map((alert) => alert.alert_type).filter(Boolean))];

    return types.map((type) => {
        const finished = usableAlerts
            .filter((a) => a.alert_type === type && a.finished_at)
            .map((a) => ({ ...a, _durationMs: new Date(a.finished_at).getTime() - new Date(a.started_at).getTime() }))
            .filter((a) => Number.isFinite(a._durationMs) && a._durationMs >= 0);
        const last24h = finished.filter((a) => nowMs - new Date(a.started_at).getTime() <= DAY_MS);
        const oldestStartedAt = finished.length
            ? finished.reduce((oldest, a) => (new Date(a.started_at) < new Date(oldest) ? a.started_at : oldest), finished[0].started_at)
            : null;

        return {
            type,
            avgDurationLast24hMs: avgOf(last24h),
            avgDurationAllTimeMs: avgOf(finished),
            countLast24h: last24h.length,
            countAllTime: finished.length,
            oldestStartedAt,
        };
    });
}

function buildAllTime(usable, nowMs) {
    const byType = {};
    usable.forEach((alert) => {
        const type = alert.alert_type || 'unknown';
        byType[type] = (byType[type] || 0) + 1;
    });
    const todayKey = lib.kyivDateKey(new Date(nowMs));
    const todayCount = usable.filter((alert) => lib.kyivDateKey(new Date(alert.started_at)) === todayKey).length;
    return { allTime: { total: usable.length, byType }, todayCount };
}

function compute(uid) {
    const nowMs = Date.now();
    const stateName = states[String(uid)] || null;
    const allAlerts = archive.getRegionAlerts(uid, stateName);
    const alerts = allAlerts.filter((alert) => {
        const startedMs = new Date(alert.started_at).getTime();
        return Number.isFinite(startedMs) && nowMs - startedMs <= MAX_HISTORY_AGE_MS;
    });

    const stats = alerts.length ? model.computeStats(alerts, nowMs, forecastConfig) : null;
    const usable = model.filterUsableAlerts(alerts);

    return {
        uid: String(uid),
        generatedAt: new Date(nowMs).toISOString(),
        source: 'alerts.in.ua',
        alertCount: alerts.length,
        stats,
        ...buildAllTime(model.filterUsableAlerts(allAlerts), nowMs),
        durations: durationStats(usable, nowMs),
    };
}

function getForecast(uid) {
    const key = String(uid);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

    const data = compute(key);
    if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
    cache.set(key, { at: Date.now(), data });
    return data;
}

const MAX_BATCH = 300;

function getForecasts(uids) {
    const unique = Array.from(new Set(uids.map(String))).slice(0, MAX_BATCH);
    return Object.fromEntries(unique.map((uid) => [uid, getForecast(uid)]));
}

module.exports = { getForecast, getForecasts };

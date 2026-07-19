const fs = require('fs');
const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const { getResourcePath } = require('./appPaths');
const { t } = require('../../i18n/i18n');

let alertTypes = null;

function getAlertTypes() {
    if (!alertTypes) {
        alertTypes = JSON.parse(fs.readFileSync(getResourcePath('data', 'alertTypes.json'), 'utf-8'));
    }
    return alertTypes;
}

function alertTypeName(alertTypeId, language) {
    const type = getAlertTypes().find((entry) => entry.id === alertTypeId);
    if (!type) return alertTypeId;
    return language === 'English' ? type.id : type.name;
}

const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';
const HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const MIN_ORIGIN_GAP_MS = 32000;

const historyCache = new Map();
let queue = Promise.resolve();
let lastOriginFetchAt = 0;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHistoryAlerts(uid) {
    const cached = historyCache.get(uid);
    if (cached && Date.now() - cached.fetchedAt < HISTORY_CACHE_TTL_MS) {
        return cached.alerts;
    }

    const run = async () => {
        const waitMs = Math.max(0, MIN_ORIGIN_GAP_MS - (Date.now() - lastOriginFetchAt));
        if (waitMs > 0) await delay(waitMs);

        const { alertProxyClientKey } = loadLocalConfig();
        lastOriginFetchAt = Date.now();

        const response = await fetch(`${PROXY_URL}/history/${uid}`, {
            headers: { 'X-Client-Key': alertProxyClientKey },
        });

        if (!response.ok) {
            logEvent(`Forecast history request failed for uid ${uid}: ${response.status}`);
            return [];
        }

        const data = await response.json();
        const alerts = data.alerts || [];
        historyCache.set(uid, { fetchedAt: Date.now(), alerts });
        return alerts;
    };

    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
}

function computeStats(alerts, nowMs) {
    if (!alerts.length) return null;

    const sortedDesc = [...alerts].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    const count = sortedDesc.length;

    const oldestMs = new Date(sortedDesc[sortedDesc.length - 1].started_at).getTime();
    const spanDays = Math.max(1, (nowMs - oldestMs) / (1000 * 60 * 60 * 24));
    const perDay = count / spanDays;

    const startTimesAsc = sortedDesc.map((a) => new Date(a.started_at).getTime()).sort((a, b) => a - b);
    let gapSum = 0;
    for (let i = 1; i < startTimesAsc.length; i++) {
        gapSum += startTimesAsc[i] - startTimesAsc[i - 1];
    }
    const avgGapMs = startTimesAsc.length > 1 ? gapSum / (startTimesAsc.length - 1) : null;

    const hourBuckets = { night: 0, morning: 0, day: 0, evening: 0 };
    sortedDesc.forEach((a) => {
        const hour = new Date(a.started_at).getHours();
        if (hour < 6) hourBuckets.night++;
        else if (hour < 12) hourBuckets.morning++;
        else if (hour < 18) hourBuckets.day++;
        else hourBuckets.evening++;
    });
    const mostCommonBucket = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0][0];

    const typeCounts = {};
    sortedDesc.forEach((a) => {
        typeCounts[a.alert_type] = (typeCounts[a.alert_type] || 0) + 1;
    });
    const mostCommonType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];

    const lastFinishedMs = sortedDesc[0].finished_at ? new Date(sortedDesc[0].finished_at).getTime() : null;
    const sinceLastMs = lastFinishedMs !== null ? Math.max(0, nowMs - lastFinishedMs) : null;

    const projectedNextMs =
        avgGapMs !== null && sinceLastMs !== null ? Math.max(0, avgGapMs - sinceLastMs) : null;

    return { count, perDay, avgGapMs, mostCommonBucket, mostCommonType, sinceLastMs, projectedNextMs };
}

function formatDuration(ms, language) {
    const totalMinutes = Math.round(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days) parts.push(`${days}${t('unitDay', language)}`);
    if (hours) parts.push(`${hours}${t('unitHour', language)}`);
    if (!days && minutes) parts.push(`${minutes}${t('unitMinute', language)}`);

    return parts.length ? parts.join(' ') : `<1${t('unitMinute', language)}`;
}

function buildForecastText(stats, language) {
    const lines = [];

    lines.push(`${t('forecastCount', language)}: ${stats.count}`);
    lines.push(`${t('forecastPerDay', language)}: ${stats.perDay.toFixed(1)}`);

    if (stats.avgGapMs !== null) {
        lines.push(`${t('forecastAvgGap', language)}: ${formatDuration(stats.avgGapMs, language)}`);
    }

    lines.push(`${t('forecastCommonTime', language)}: ${t(`hourBucket_${stats.mostCommonBucket}`, language)}`);
    lines.push(`${t('forecastCommonType', language)}: ${alertTypeName(stats.mostCommonType, language)}`);

    if (stats.sinceLastMs !== null) {
        lines.push(`${t('forecastSinceLast', language)}: ${formatDuration(stats.sinceLastMs, language)}`);
    }

    if (stats.projectedNextMs !== null) {
        const typeName = alertTypeName(stats.mostCommonType, language);
        lines.push(
            `${t('forecastProjected', language)} (${typeName}): ~${formatDuration(stats.projectedNextMs, language)}`
        );
    }

    lines.push('');
    lines.push(t('forecastDisclaimer', language));

    return lines.join('\n');
}

async function getRegionForecastText(uid, language) {
    const alerts = await fetchHistoryAlerts(uid);
    const stats = computeStats(alerts, Date.now());
    if (!stats) return null;
    return buildForecastText(stats, language);
}

module.exports = { getRegionForecastText };

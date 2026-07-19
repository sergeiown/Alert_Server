const fs = require('fs');
const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const { getResourcePath } = require('./appPaths');
const { t } = require('../../i18n/i18n');

const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function weekdayName(weekdayIndex, language) {
    const locale = language === 'English' ? 'en-US' : 'uk-UA';
    const reference = new Date(Date.UTC(2023, 0, 1 + weekdayIndex));
    return reference.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
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
    const perDay = count / WINDOW_DAYS;

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

    const windowStartMs = nowMs - WINDOW_DAYS * DAY_MS;
    const weekdayOccurrences = [0, 0, 0, 0, 0, 0, 0];
    for (let d = 0; d < WINDOW_DAYS; d++) {
        const day = new Date(windowStartMs + d * DAY_MS).getDay();
        weekdayOccurrences[day]++;
    }

    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
    sortedDesc.forEach((a) => {
        const day = new Date(a.started_at).getDay();
        weekdayCounts[day]++;
    });

    const weekdayRates = weekdayCounts.map((c, i) => c / Math.max(1, weekdayOccurrences[i]));
    const maxWeekdayRate = Math.max(...weekdayRates);
    const mostCommonWeekdays =
        maxWeekdayRate > 0
            ? weekdayRates.reduce((acc, rate, i) => (rate === maxWeekdayRate ? [...acc, i] : acc), [])
            : [];

    const todayWeekday = new Date(nowMs).getDay();
    const todayWeekdayRate = weekdayRates[todayWeekday];

    const byType = new Map();
    sortedDesc.forEach((a) => {
        if (!byType.has(a.alert_type)) byType.set(a.alert_type, []);
        byType.get(a.alert_type).push(a);
    });

    const typeBreakdown = Array.from(byType.entries())
        .map(([type, typeAlerts]) => {
            const typeCount = typeAlerts.length;
            const typeStartTimesAsc = typeAlerts
                .map((a) => new Date(a.started_at).getTime())
                .sort((a, b) => a - b);

            let typeGapSum = 0;
            for (let i = 1; i < typeStartTimesAsc.length; i++) {
                typeGapSum += typeStartTimesAsc[i] - typeStartTimesAsc[i - 1];
            }
            const typeAvgGapMs = typeStartTimesAsc.length > 1 ? typeGapSum / (typeStartTimesAsc.length - 1) : null;

            const typeSortedDesc = [...typeAlerts].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
            const typeLastFinishedMs = typeSortedDesc[0].finished_at
                ? new Date(typeSortedDesc[0].finished_at).getTime()
                : null;
            const typeSinceLastMs = typeLastFinishedMs !== null ? Math.max(0, nowMs - typeLastFinishedMs) : null;

            const typeProjectedNextMs =
                typeAvgGapMs !== null && typeSinceLastMs !== null
                    ? Math.max(0, typeAvgGapMs - typeSinceLastMs)
                    : null;

            const percent = Math.round((typeCount / count) * 100);
            const probabilityToday = Math.round((1 - Math.exp(-todayWeekdayRate * (typeCount / count))) * 100);

            return { type, count: typeCount, percent, projectedNextMs: typeProjectedNextMs, probabilityToday };
        })
        .sort((a, b) => b.count - a.count);

    const lastFinishedMs = sortedDesc[0].finished_at ? new Date(sortedDesc[0].finished_at).getTime() : null;
    const sinceLastMs = lastFinishedMs !== null ? Math.max(0, nowMs - lastFinishedMs) : null;

    return {
        count,
        perDay,
        avgGapMs,
        mostCommonBucket,
        mostCommonWeekdays,
        todayWeekday,
        typeBreakdown,
        sinceLastMs,
    };
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

    const weekdayNames = stats.mostCommonWeekdays.map((day) => weekdayName(day, language)).join(', ');
    if (weekdayNames) {
        lines.push(`${t('forecastCommonWeekday', language)}: ${weekdayNames}`);
    }

    const typesLine = stats.typeBreakdown
        .map((entry) => `${alertTypeName(entry.type, language)} ${entry.percent}% (${entry.count})`)
        .join(', ');
    lines.push(`${t('forecastTypes', language)}: ${typesLine}`);

    if (stats.sinceLastMs !== null) {
        lines.push(`${t('forecastSinceLast', language)}: ${formatDuration(stats.sinceLastMs, language)}`);
    }

    lines.push('');
    lines.push(`${t('forecastProbabilityToday', language)} (${weekdayName(stats.todayWeekday, language)}):`);
    stats.typeBreakdown.forEach((entry) => {
        const typeName = alertTypeName(entry.type, language);
        const etaText =
            entry.projectedNextMs !== null
                ? `, ${t('forecastEtaLabel', language)} ~${formatDuration(entry.projectedNextMs, language)}`
                : '';
        lines.push(`  - ${typeName}: ${entry.probabilityToday}%${etaText}`);
    });

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

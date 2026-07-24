const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const { alertTypeName } = require('./alertTypes');
const { t } = require('../../i18n/i18n');
const forecastConfig = require('./forecastConfig');
const { computeStats, estimateRegionLambda, estimateTypeLambda } = require('./forecastModel');
const historyStore = require('./forecastHistoryStore');

function weekdayName(weekdayIndex, language) {
    const locale = language === 'English' ? 'en-US' : 'uk-UA';
    const reference = new Date(Date.UTC(2023, 0, 1 + weekdayIndex));
    return reference.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
}

const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';
const HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const MIN_ORIGIN_GAP_MS = 35000;

const HISTORY_ORIGIN_ISSUE_LOG_COOLDOWN_MS = 30 * 60 * 1000;
const HISTORY_BACKOFF_MS = 60000;

const historyCache = new Map();
let queue = Promise.resolve();
let lastOriginFetchAt = 0;

const loggedNoteValues = new Set();
let loggedCalculatedNonNull = false;

let historyLastLoggedStatus = null;
let historyLastLoggedAt = 0;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeOriginStatus(status) {
    if (status === 401) return 'token invalid, revoked, or expired';
    if (status === 403) return 'IP blocked or country unavailable';
    if (status === 429) return 'rate limit exceeded';
    return `unexpected status ${status}`;
}

function logHistoryOriginIssue(uid, status) {
    const now = Date.now();
    if (status === historyLastLoggedStatus && now - historyLastLoggedAt < HISTORY_ORIGIN_ISSUE_LOG_COOLDOWN_MS) return;
    historyLastLoggedStatus = status;
    historyLastLoggedAt = now;
    logEvent(`alert-proxy history origin issue (uid ${uid}): ${status} (${describeOriginStatus(status)})`);
}

function noteHistoryOriginHealthy() {
    if (historyLastLoggedStatus === null) return;
    logEvent('alert-proxy history origin recovered');
    historyLastLoggedStatus = null;
}

function logDataHygiene(alerts) {
    alerts.forEach((alert) => {
        if (alert.notes && !loggedNoteValues.has(alert.notes)) {
            loggedNoteValues.add(alert.notes);
            logEvent(`Forecast: new "notes" value observed: ${alert.notes}`);
        }
        if (alert.calculated !== null && alert.calculated !== undefined && !loggedCalculatedNonNull) {
            loggedCalculatedNonNull = true;
            logEvent(`Forecast: "calculated" field is non-null: ${JSON.stringify(alert.calculated)}`);
        }
    });
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

        if (response.status === 429) {
            logHistoryOriginIssue(uid, 429);
            lastOriginFetchAt = Date.now() + HISTORY_BACKOFF_MS;
            return [];
        }

        if (!response.ok) {
            logHistoryOriginIssue(uid, response.status);
            return [];
        }

        const data = await response.json();
        const alerts = data.alerts || [];

        const originErrorStatus = response.headers.get('X-Origin-Error-Status');
        if (originErrorStatus) logHistoryOriginIssue(uid, Number(originErrorStatus));
        else noteHistoryOriginHealthy();

        logDataHygiene(alerts);
        historyStore.mergeAlerts(uid, alerts);
        historyCache.set(uid, { fetchedAt: Date.now(), alerts });
        return alerts;
    };

    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
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

async function getAccumulatedAlerts(uid) {
    await fetchHistoryAlerts(uid);
    return historyStore.getAllAlertsForRegion(uid);
}

async function getRegionForecastText(uid, language) {
    const alerts = await getAccumulatedAlerts(uid);
    const stats = computeStats(alerts, Date.now(), forecastConfig);
    if (!stats) return null;
    return buildForecastText(stats, language);
}

async function getRegionLambda(uid) {
    const alerts = await getAccumulatedAlerts(uid);
    if (!alerts.length) return null;
    const { lambda } = estimateRegionLambda(alerts, Date.now(), forecastConfig);
    return lambda;
}

async function getRegionTypeLambdas(uid) {
    const alerts = await getAccumulatedAlerts(uid);
    if (!alerts.length) return [];

    const nowMs = Date.now();
    const { lambda: lambdaRegion, usableAlerts } = estimateRegionLambda(alerts, nowMs, forecastConfig);
    if (!usableAlerts.length) return [];

    const byType = new Map();
    usableAlerts.forEach((alert) => {
        if (!byType.has(alert.alert_type)) byType.set(alert.alert_type, []);
        byType.get(alert.alert_type).push(alert);
    });

    return Array.from(byType.entries()).map(([type, typeAlerts]) => ({
        type,
        lambda: estimateTypeLambda(typeAlerts, usableAlerts.length, lambdaRegion, nowMs, forecastConfig),
    }));
}

module.exports = {
    getRegionForecastText,
    getRegionLambda,
    getRegionTypeLambdas,
    fetchHistoryAlerts,
    formatDuration,
};

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const { alertTypeName } = require('./alertTypes');
const { t } = require('../../i18n/i18n');
const forecastConfig = require('./forecastConfig');
const { computeStats, filterUsableAlerts } = require('./forecastModel');
const historyStore = require('./forecastHistoryStore');
const { getHistoryFetchTarget } = require('./locationFilter');

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
    logEvent(`alert-proxy history origin issue (uid ${uid}, alerts.in.ua): ${status} (${describeOriginStatus(status)})`, 'NETWORK');
}

function noteHistoryOriginHealthy() {
    if (historyLastLoggedStatus === null) return;
    logEvent('alert-proxy history origin recovered (alerts.in.ua)', 'NETWORK');
    historyLastLoggedStatus = null;
}

async function fetchOblastAlerts(stateUid) {
    const cached = historyCache.get(stateUid);
    if (cached && Date.now() - cached.fetchedAt < HISTORY_CACHE_TTL_MS) {
        return cached.alerts;
    }

    const run = async () => {
        const waitMs = Math.max(0, MIN_ORIGIN_GAP_MS - (Date.now() - lastOriginFetchAt));
        if (waitMs > 0) await delay(waitMs);

        const { alertProxyClientKey } = loadLocalConfig();
        lastOriginFetchAt = Date.now();

        const response = await fetch(`${PROXY_URL}/history/${stateUid}`, {
            headers: { 'X-Client-Key': alertProxyClientKey },
        });

        if (response.status === 429) {
            logHistoryOriginIssue(stateUid, 429);
            lastOriginFetchAt = Date.now() + HISTORY_BACKOFF_MS;
            return historyCache.get(stateUid)?.alerts || [];
        }

        if (!response.ok) {
            logHistoryOriginIssue(stateUid, response.status);
            return historyCache.get(stateUid)?.alerts || [];
        }

        const data = await response.json();
        const alerts = data.alerts || [];

        const originErrorStatus = response.headers.get('X-Origin-Error-Status');
        if (originErrorStatus) logHistoryOriginIssue(stateUid, Number(originErrorStatus));
        else noteHistoryOriginHealthy();

        historyCache.set(stateUid, { fetchedAt: Date.now(), alerts });
        return alerts;
    };

    const result = queue.then(run, run);
    queue = result.catch(() => historyCache.get(stateUid)?.alerts || []);
    return result;
}

// Preferred: UkraineAlarm's regionHistory, one direct request for this exact uid, no need to fetch
// a whole oblast and filter it down. Not always available (see alert-proxy/src/index.js's own
// comment - roughly half of regionHistory calls fail outright, a real reliability gap on
// UkraineAlarm's own side) - null return means "couldn't get it", not "genuinely empty", so the
// caller knows to fall back rather than treat that as a real answer.
async function fetchUkraineAlarmHistory(uid) {
    try {
        const { alertProxyClientKey } = loadLocalConfig();
        const response = await fetch(`${PROXY_URL}/ukrainealarm-region-history/${uid}`, {
            headers: { 'X-Client-Key': alertProxyClientKey },
        });
        if (!response.ok) return null;

        const data = await response.json();
        if (!data || !Array.isArray(data.alerts)) return null;
        return data.alerts;
    } catch (err) {
        return null;
    }
}

async function fetchHistoryAlerts(uid) {
    const ukraineAlarmAlerts = await fetchUkraineAlarmHistory(uid);
    if (ukraineAlarmAlerts) {
        historyStore.mergeAlerts(uid, ukraineAlarmAlerts, { source: 'ukrainealarm' });
        return ukraineAlarmAlerts;
    }

    const target = getHistoryFetchTarget(uid);
    if (!target) return [];

    const oblastAlerts = await fetchOblastAlerts(target.stateUid);
    const matched =
        target.matchUid === null
            ? oblastAlerts
            : oblastAlerts.filter((alert) => String(alert.location_uid) === String(target.matchUid));
    historyStore.mergeAlerts(uid, matched, { source: 'alerts.in.ua' });
    return matched;
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

// Display name per lastHistorySourceByUid's own vocabulary - same two possible sources as
// elsewhere (Trends Today, live map attribution).
const HISTORY_SOURCE_DISPLAY = {
    ukrainealarm: 'UkraineAlarm',
    'alerts.in.ua': 'alerts.in.ua',
};

// Below 99.5% a whole percent is precise enough and reads cleaner; at or above it, 1-e^(-x) is so
// flat that almost every currently-active region would otherwise show the same bare "100%" with
// no way to tell a merely busy region from an extremely busy one - two decimals keeps that
// distinction visible instead of quietly discarding it at the rounding step.
function formatProbabilityPercent(fraction) {
    const percent = fraction * 100;
    return percent >= 99.5 ? percent.toFixed(2) : Math.round(percent).toString();
}

function buildForecastText(stats, language, source) {
    const lines = [];

    const sourceName = HISTORY_SOURCE_DISPLAY[source];
    lines.push(`${t('forecastSourceLabel', language)}: ${sourceName || t('forecastSourceUnknown', language)}`);

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
                ? `, ${t('forecastEtaLabel', language)} ${formatDuration(entry.projectedNextMs, language)}`
                : '';
        const rangeText = entry.gapRange
            ? ` (${t('forecastRangeLabel', language)} ${formatDuration(entry.gapRange.low, language)} - ${formatDuration(entry.gapRange.high, language)})`
            : '';
        // probabilityToday alone stops telling regions apart once it's saturated (see
        // formatProbabilityPercent) - expectedToday (a plain count, not a 0-1 probability) never
        // saturates, so it's what still shows a very active region is worse than a merely active
        // one even when both read as ~100%.
        const expectedText = t('forecastExpectedTodayLabel', language).replace('{count}', entry.expectedToday.toFixed(1));
        lines.push(`  - ${typeName}: ${t('forecastProbabilityPrefix', language)} ${formatProbabilityPercent(entry.probabilityToday)}% (${expectedText})${etaText}${rangeText}`);
    });

    lines.push('');
    lines.push(t('forecastDisclaimer', language));

    return lines.join('\n');
}

function buildActiveDurationText(durationStats, language) {
    const lines = [t('forecastActiveAlert', language)];

    durationStats.forEach((entry) => {
        lines.push('');
        lines.push(`${t('forecastActiveDurationHeader', language)} (${alertTypeName(entry.type, language)}):`);
        lines.push(
            `  - ${t('forecastActiveDurationLast24h', language)}: ${
                entry.avgDurationLast24hMs !== null
                    ? `${formatDuration(entry.avgDurationLast24hMs, language)} (${t('forecastActiveDurationSampleSize', language).replace('{count}', entry.countLast24h)})`
                    : t('forecastActiveDurationNoData', language)
            }`
        );
        lines.push(
            `  - ${t('forecastActiveDurationAllTime', language)}: ${
                entry.avgDurationAllTimeMs !== null
                    ? `${formatDuration(entry.avgDurationAllTimeMs, language)} (${t('forecastActiveDurationSampleSize', language).replace('{count}', entry.countAllTime)})`
                    : t('forecastActiveDurationNoData', language)
            }`
        );
    });

    return lines.join('\n');
}

async function getAccumulatedAlerts(uid) {
    await fetchHistoryAlerts(uid);
    return historyStore.getAllAlertsForRegion(uid);
}

function getRegionForecastText(uid, language) {
    const alerts = historyStore.getAllAlertsForRegion(uid);
    const stats = computeStats(alerts, Date.now(), forecastConfig);
    if (!stats) return null;
    return buildForecastText(stats, language, historyStore.getRegionSource(uid));
}

// The soonest type entry, by the same median-grounded projectedNextMs shown in the Forecast
// window - so any other surface quoting "soonest ETA" for a region always agrees with it.
function soonestTypeEntry(typeBreakdown) {
    const candidates = typeBreakdown.filter((entry) => entry.projectedNextMs !== null);
    if (!candidates.length) return null;
    return candidates.reduce((soonest, entry) => (entry.projectedNextMs < soonest.projectedNextMs ? entry : soonest));
}

function getRegionSoonestEtaMs(uid) {
    const alerts = historyStore.getAllAlertsForRegion(uid);
    const stats = computeStats(alerts, Date.now(), forecastConfig);
    if (!stats) return null;

    const soonest = soonestTypeEntry(stats.typeBreakdown);
    return soonest ? soonest.projectedNextMs : null;
}

// For an ACTIVE alert - how long it typically lasts is more immediately useful than the
// probability/ETA of the next one. Grounded in the same locally accumulated history as everything
// else; only alerts with a real recorded finished_at can contribute a duration (one that's still
// active elsewhere with no end yet obviously can't).
function getRegionDurationStats(uid, alertTypes) {
    const alerts = filterUsableAlerts(historyStore.getAllAlertsForRegion(uid));
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    const avgOf = (list) => (list.length ? list.reduce((sum, a) => sum + a._durationMs, 0) / list.length : null);

    return alertTypes.map((type) => {
        const finished = alerts
            .filter((a) => a.alert_type === type && a.finished_at)
            .map((a) => ({ ...a, _durationMs: new Date(a.finished_at).getTime() - new Date(a.started_at).getTime() }));
        const last24h = finished.filter((a) => now - new Date(a.started_at).getTime() <= DAY_MS);

        return {
            type,
            avgDurationLast24hMs: avgOf(last24h),
            avgDurationAllTimeMs: avgOf(finished),
            countLast24h: last24h.length,
            countAllTime: finished.length,
        };
    });
}

async function getRegionSoonestPrediction(uid) {
    const alerts = await getAccumulatedAlerts(uid);
    if (!alerts.length) return null;

    const stats = computeStats(alerts, Date.now(), forecastConfig);
    if (!stats) return null;

    return soonestTypeEntry(stats.typeBreakdown);
}

module.exports = {
    getRegionForecastText,
    getRegionSoonestEtaMs,
    getRegionSoonestPrediction,
    getRegionDurationStats,
    buildActiveDurationText,
    fetchHistoryAlerts,
    formatDuration,
};

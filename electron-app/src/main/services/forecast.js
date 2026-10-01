// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const { alertTypeName } = require('./alertTypes');
const { t } = require('../../i18n/i18n');
const { PROXY_URL, getClientVersion, proxyFetch, describeError } = require('./proxyConfig');

const FORECAST_CACHE_TTL_MS = 60 * 1000;
const FETCH_ERROR_LOG_COOLDOWN_MS = 10 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const forecastCache = new Map();
const inflight = new Map();
let lastErrorLoggedAt = 0;

function weekdayName(weekdayIndex, language) {
    const locale = language === 'English' ? 'en-US' : 'uk-UA';
    const reference = new Date(Date.UTC(2023, 0, 1 + weekdayIndex));
    return reference.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
}

function logFetchError(uid, detail) {
    const now = Date.now();
    if (now - lastErrorLoggedAt < FETCH_ERROR_LOG_COOLDOWN_MS) return;
    lastErrorLoggedAt = now;
    logEvent(`Forecast fetch failed (uid ${uid}): ${detail}`, 'NETWORK');
}

async function requestForecast(uid) {
    const { alertProxyClientKey } = loadLocalConfig();
    if (!alertProxyClientKey) return null;

    const response = await proxyFetch(`${PROXY_URL}/forecast/${uid}`, {
        headers: { 'X-Client-Key': alertProxyClientKey, 'X-Client-Version': getClientVersion() },
    });
    if (!response.ok) throw new Error(`status ${response.status}`);

    const data = await response.json();
    if (!data || !Array.isArray(data.durations)) throw new Error('unexpected response');
    return data;
}

const BATCH_SIZE = 300;

async function requestForecastBatch(uids) {
    const { alertProxyClientKey } = loadLocalConfig();
    if (!alertProxyClientKey) return;

    const response = await proxyFetch(`${PROXY_URL}/forecast?uids=${uids.join(',')}`, {
        headers: { 'X-Client-Key': alertProxyClientKey, 'X-Client-Version': getClientVersion() },
    });
    if (!response.ok) throw new Error(`status ${response.status}`);

    const data = await response.json();
    if (!data || typeof data.forecasts !== 'object') throw new Error('unexpected response');

    Object.entries(data.forecasts).forEach(([uid, forecast]) => {
        if (forecast && Array.isArray(forecast.durations)) forecastCache.set(uid, { data: forecast, fetchedAt: Date.now() });
    });
}

async function prefetchForecasts(uids) {
    const stale = Array.from(new Set(uids.map(String))).filter((uid) => {
        const cached = forecastCache.get(uid);
        return !cached || Date.now() - cached.fetchedAt >= FORECAST_CACHE_TTL_MS;
    });

    for (let i = 0; i < stale.length; i += BATCH_SIZE) {
        try {
            await requestForecastBatch(stale.slice(i, i + BATCH_SIZE));
        } catch (err) {
            logFetchError('batch', describeError(err));
        }
    }
}

async function fetchRegionForecast(uid) {
    const key = String(uid);
    const cached = forecastCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < FORECAST_CACHE_TTL_MS) return cached.data;
    if (inflight.has(key)) return inflight.get(key);

    const promise = requestForecast(key)
        .then((data) => {
            if (data) forecastCache.set(key, { data, fetchedAt: Date.now() });
            return data;
        })
        .catch((err) => {
            logFetchError(key, describeError(err));
            return cached ? cached.data : null;
        })
        .finally(() => inflight.delete(key));

    inflight.set(key, promise);
    return promise;
}

function cachedForecast(uid) {
    const entry = forecastCache.get(String(uid));
    return entry ? entry.data : null;
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

const HISTORY_SOURCE_DISPLAY = {
    ukrainealarm: 'UkraineAlarm',
    'alerts.in.ua': 'alerts.in.ua',
};

function formatProbabilityPercent(fraction, language) {
    const percent = fraction * 100;
    return percent >= 99.5 ? t('forecastProbabilityNearCertain', language) : Math.round(percent).toString();
}

function formatShortDateTime(dateValue, language) {
    const locale = language === 'English' ? 'en-US' : 'uk-UA';
    return new Date(dateValue).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function buildForecastText(stats, language, source) {
    const lines = [];

    lines.push(`${t('forecastAsOf', language)}: ${formatShortDateTime(Date.now(), language)}`);

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

    if (stats.lastAlertDurationMs !== null) {
        lines.push(`${t('forecastLastDuration', language)}: ${formatDuration(stats.lastAlertDurationMs, language)}`);
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
        lines.push(`  - ${typeName}: ${t('forecastProbabilityPrefix', language)} ${formatProbabilityPercent(entry.probabilityToday, language)}%${etaText}${rangeText}`);

        lines.push(`  - ${t('forecastExpectedTodayLabel', language).replace('{count}', Math.round(entry.expectedToday).toString())}`);
    });

    lines.push('');
    lines.push(t('forecastDisclaimer', language));

    return lines.join('\n');
}

function daysSince(dateValue) {
    return Math.max(1, Math.round((Date.now() - new Date(dateValue).getTime()) / MS_PER_DAY));
}

function daysWord(count, language) {
    if (language === 'English') return count === 1 ? 'day' : 'days';

    const mod100 = count % 100;
    const mod10 = count % 10;
    if (mod100 >= 11 && mod100 <= 14) return 'діб';
    if (mod10 === 1) return 'добу';
    if (mod10 >= 2 && mod10 <= 4) return 'доби';
    return 'діб';
}

function buildActiveDurationLines(durationStats, language) {
    const lines = [{ text: t('forecastActiveDurationNotApplicable', language), level: null }];

    durationStats.forEach((entry) => {
        const typeName = alertTypeName(entry.type, language);
        const days = entry.oldestStartedAt ? daysSince(entry.oldestStartedAt) : null;
        const allTimeLabel =
            days !== null
                ? t('forecastActiveDurationObservationDays', language).replace('{days}', days.toString()).replace('{daysWord}', daysWord(days, language))
                : t('forecastActiveDurationAllTime', language);

        lines.push({ text: `${t('forecastActiveAlert', language)} ${t('alertTypeLabel', language)}: ${typeName}.`, level: null });
        (entry.threatLines || []).forEach((threatLine) => lines.push({ text: threatLine.text, level: threatLine.level }));
        lines.push({
            text: `${t('alertStartedAt', language)}: ${formatShortDateTime(entry.ongoingSinceMs, language)}. ${t('alertOngoingDuration', language)}: ${formatDuration(Date.now() - entry.ongoingSinceMs, language)}.`,
            level: null,
        });
        lines.push({ text: `${t('forecastActiveDurationHeader', language)}:`, level: null });
        lines.push({
            text: `  - ${t('forecastActiveDurationLast24h', language)}: ${
                entry.avgDurationLast24hMs !== null
                    ? `${formatDuration(entry.avgDurationLast24hMs, language)} (${t('forecastActiveDurationSampleSize', language).replace('{count}', entry.countLast24h)})`
                    : t('forecastActiveDurationNoData', language)
            }`,
            level: null,
        });
        lines.push({
            text: `  - ${allTimeLabel}: ${
                entry.avgDurationAllTimeMs !== null
                    ? `${formatDuration(entry.avgDurationAllTimeMs, language)} (${t('forecastActiveDurationSampleSize', language).replace('{count}', entry.countAllTime)})`
                    : t('forecastActiveDurationNoData', language)
            }`,
            level: null,
        });
    });

    return lines;
}

function buildActiveDurationText(durationStats, language) {
    return buildActiveDurationLines(durationStats, language)
        .map((line) => line.text)
        .join('\n');
}

function soonestTypeEntry(typeBreakdown) {
    const candidates = typeBreakdown.filter((entry) => entry.projectedNextMs !== null);
    if (!candidates.length) return null;
    return candidates.reduce((soonest, entry) => (entry.projectedNextMs < soonest.projectedNextMs ? entry : soonest));
}

async function getRegionForecastText(uid, language) {
    const data = await fetchRegionForecast(uid);
    if (!data || !data.stats) return null;
    return buildForecastText(data.stats, language, data.source);
}

function getRegionSoonestEtaMs(uid) {
    const data = cachedForecast(uid);
    if (!data || !data.stats) return null;

    const soonest = soonestTypeEntry(data.stats.typeBreakdown);
    return soonest ? soonest.projectedNextMs : null;
}

async function getRegionSoonestPrediction(uid) {
    const data = await fetchRegionForecast(uid);
    if (!data || !data.stats) return null;
    return soonestTypeEntry(data.stats.typeBreakdown);
}

function emptyDurationEntry(type) {
    return {
        type,
        avgDurationLast24hMs: null,
        avgDurationAllTimeMs: null,
        countLast24h: 0,
        countAllTime: 0,
        oldestStartedAt: null,
    };
}

async function getRegionDurationStats(uid, alertTypes) {
    const data = await fetchRegionForecast(uid);
    return alertTypes.map((type) => {
        const entry = data ? data.durations.find((duration) => duration.type === type) : null;
        return entry ? { ...entry } : emptyDurationEntry(type);
    });
}

function prefetchForecast(uid) {
    return fetchRegionForecast(uid);
}

module.exports = {
    getRegionForecastText,
    getRegionSoonestEtaMs,
    getRegionSoonestPrediction,
    getRegionDurationStats,
    buildActiveDurationText,
    buildActiveDurationLines,
    prefetchForecast,
    prefetchForecasts,
    formatDuration,
};

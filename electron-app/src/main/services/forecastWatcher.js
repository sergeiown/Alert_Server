// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { logEvent } = require('./logger');
const { getUserDataFile } = require('./appPaths');
const regionsStore = require('./regionsStore');
const settingsStore = require('./settingsStore');
const DEFAULT_LOOKAHEAD_MINUTES = 120;
const { getRegionSoonestPrediction, prefetchForecasts, formatDuration } = require('./forecast');
const { getLatestAlertData } = require('./activeAlertData');
const { getLocationLookup, getAlertCoverageUids } = require('./locationFilter');
const { alertTypeName } = require('./alertTypes');
const { notifyWithMap, isAlertActivityRecent } = require('./notifier');
const { openForecastWindow } = require('../windows/forecastWindow');
const { t } = require('../../i18n/i18n');
const notifyProfile = require('./notifyProfile');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const FORECAST_COLOR = '#2563eb';
const FORECAST_GLOBAL_COOLDOWN_MS = 15 * 60 * 1000;
const ALERT_QUIET_MS = 3 * 60 * 1000;
const GROUP_NAME_LIMIT = 4;
const GROUP_MAP_LIMIT = 8;
const MIN_RENOTIFY_COOLDOWN_MS = 10 * 60 * 1000;

const STATE_FILE = 'forecast_notified.json';
const STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const predictions = new Map();
const persistedNotifiedAt = new Map();
let lastForecastToastAt = 0;

function loadNotifiedState() {
    try {
        const parsed = JSON.parse(fs.readFileSync(getUserDataFile(STATE_FILE), 'utf-8'));
        const now = Date.now();
        const lastToastAt = Number(parsed.lastToastAt);
        if (Number.isFinite(lastToastAt) && now - lastToastAt < STATE_MAX_AGE_MS) lastForecastToastAt = lastToastAt;
        Object.entries(parsed.regions || {}).forEach(([uid, at]) => {
            if (Number.isFinite(Number(at)) && now - Number(at) < STATE_MAX_AGE_MS) persistedNotifiedAt.set(String(uid), Number(at));
        });
    } catch (err) {
        return;
    }
}

function saveNotifiedState() {
    const regions = {};
    predictions.forEach((state, uid) => {
        if (state.lastNotifiedAt) regions[String(uid)] = state.lastNotifiedAt;
    });
    persistedNotifiedAt.forEach((at, uid) => {
        if (!(uid in regions)) regions[uid] = at;
    });
    try {
        fs.writeFileSync(getUserDataFile(STATE_FILE), JSON.stringify({ lastToastAt: lastForecastToastAt, regions }), 'utf-8');
    } catch (err) {
        logEvent(`Forecast state save failed: ${err.message}`, 'WARNING');
    }
}

function forecastEffects() {
    const profile = notifyProfile.resolve(settingsStore.getSettings().notifyProfile, 'forecast');
    return { emergency: profile.emergency, autoCloseMs: profile.ms };
}

function isRegionActive(uid) {
    const activeData = getLatestAlertData();
    return Boolean(
        activeData && activeData.alerts.some((alert) => getAlertCoverageUids(alert).includes(String(uid)))
    );
}

function regionName(uid, language) {
    const info = getLocationLookup().get(String(uid));
    return info ? (language === 'English' ? info.lat : info.name) : String(uid);
}

function notifyApproaching(uid, alertType, etaMs, language) {
    const name = regionName(uid, language);
    const typeName = alertTypeName(alertType, language);
    const title = `${t('forecastNotifyTitle', language)}: ${String(typeName).toLowerCase()}`;
    const etaText = formatDuration(etaMs, language);

    notifyWithMap({
        uid,
        title,
        bodyLines: [`${t('location', language)}: ${name}`, `${t('forecastNotifyEta', language)}: ${etaText}`],
        iconName: 'forecast.png',
        color: FORECAST_COLOR,
        onClick: () => openForecastWindow(),
        silent: true,
        ...forecastEffects(),
    });

    logEvent(
        `Forecast notify: ${regionName(uid, 'English')} - ${alertTypeName(alertType, 'English')} (uid ${uid} - eta approximately ${formatDuration(etaMs, 'English')})`,
        'INFO'
    );
}

function notifyApproachingGroup(candidates, language) {
    const items = candidates.map(({ uid, etaMs }) => `${regionName(uid, language)} (${formatDuration(etaMs, language)})`);
    const rest = items.length - GROUP_NAME_LIMIT;
    const listed = items.slice(0, GROUP_NAME_LIMIT).join(', ');
    const line = `${t('forecastGroupNearest', language)}: ${listed}${rest > 0 ? ` ${t('digestAndMore', language).replace('{count}', rest)}` : ''}`;

    notifyWithMap({
        uids: candidates.slice(0, GROUP_MAP_LIMIT).map(({ uid }) => uid),
        title: t('forecastGroupTitle', language),
        bodyLines: [line],
        iconName: 'forecast.png',
        color: FORECAST_COLOR,
        onClick: () => openForecastWindow(),
        silent: true,
        ...forecastEffects(),
    });

    logEvent(`Forecast notify (group): ${candidates.length} regions, soonest ${regionName(candidates[0].uid, 'English')} in approximately ${formatDuration(candidates[0].etaMs, 'English')}`, 'INFO');
}

async function evaluateRegion(uid, language) {
    if (isRegionActive(uid)) {
        predictions.delete(uid);
        return null;
    }

    const soonest = await getRegionSoonestPrediction(uid);
    if (!soonest) {
        predictions.delete(uid);
        return null;
    }

    const now = Date.now();
    const predictedAt = now + soonest.projectedNextMs;
    const previous = predictions.get(uid);
    const state = { predictedAt, lastNotifiedAt: previous ? previous.lastNotifiedAt : persistedNotifiedAt.get(String(uid)) || null };
    predictions.set(uid, state);

    const settings = settingsStore.getSettings();
    if (!settings.visualNotificationsEnabled || !settings.forecastNotifyEnabled) return null;

    const lookaheadMinutes = settings.forecastNotifyLookaheadMinutes || DEFAULT_LOOKAHEAD_MINUTES;
    const lookaheadMs = lookaheadMinutes * 60 * 1000;
    if (soonest.projectedNextMs > lookaheadMs) return null;

    const cooldownMs = Math.max(MIN_RENOTIFY_COOLDOWN_MS, soonest.projectedNextMs / 2);
    if (state.lastNotifiedAt && now - state.lastNotifiedAt < cooldownMs) return null;

    return { uid, alertType: soonest.type, etaMs: soonest.projectedNextMs, state };
}

function pruneToSelectedUids(selectedUids) {
    const selectedSet = new Set(selectedUids.map(String));
    Array.from(predictions.keys()).forEach((uid) => {
        if (!selectedSet.has(String(uid))) predictions.delete(uid);
    });
}

async function runCheck() {
    const { language } = settingsStore.getSettings();
    const selectedUids = regionsStore.getSelectedUids();
    pruneToSelectedUids(selectedUids);
    await prefetchForecasts(selectedUids);

    const candidates = [];
    for (const uid of selectedUids) {
        try {
            const candidate = await evaluateRegion(uid, language);
            if (candidate) candidates.push(candidate);
        } catch (err) {
            logEvent(`Forecast watcher error for uid ${uid}: ${err.message}`, 'ERROR');
        }
    }

    if (!candidates.length) return;
    if (isAlertActivityRecent(ALERT_QUIET_MS)) return;

    const now = Date.now();
    if (now - lastForecastToastAt < FORECAST_GLOBAL_COOLDOWN_MS) return;

    candidates.sort((a, b) => a.etaMs - b.etaMs);
    if (candidates.length === 1) notifyApproaching(candidates[0].uid, candidates[0].alertType, candidates[0].etaMs, language);
    else notifyApproachingGroup(candidates, language);

    lastForecastToastAt = now;
    candidates.forEach(({ uid, state }) => predictions.set(uid, { ...state, lastNotifiedAt: now }));
    saveNotifiedState();
}

function startForecastWatcher() {
    loadNotifiedState();
    runCheck();
    return setInterval(runCheck, CHECK_INTERVAL_MS);
}

function getUpcomingPredictions(language, limit) {
    return Array.from(predictions.entries())
        .filter(([uid]) => !isRegionActive(uid))
        .map(([uid, state]) => ({ uid, name: regionName(uid, language), predictedAt: state.predictedAt }))
        .sort((a, b) => a.predictedAt - b.predictedAt)
        .slice(0, limit);
}

module.exports = { startForecastWatcher, getUpcomingPredictions, pruneToSelectedUids };

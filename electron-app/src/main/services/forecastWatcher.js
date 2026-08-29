// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const regionsStore = require('./regionsStore');
const settingsStore = require('./settingsStore');
const forecastConfig = require('./forecastConfig');
const { getRegionSoonestPrediction, formatDuration } = require('./forecast');
const { getLatestAlertData } = require('./alertPoller');
const { getLocationLookup, getAlertCoverageUids } = require('./locationFilter');
const { alertTypeName } = require('./alertTypes');
const { notifyWithMap } = require('./notifier');
const { openForecastWindow } = require('../windows/forecastWindow');
const { t } = require('../../i18n/i18n');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const FORECAST_COLOR = '#2563eb';
const MAX_SIMULTANEOUS_FORECAST_NOTIFICATIONS = 3;

const predictions = new Map();

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
    const title = `${t('forecastNotifyTitle', language)}: ${typeName}`;
    const etaText = formatDuration(etaMs, language);

    notifyWithMap({
        uid,
        title,
        bodyLines: [`${t('location', language)}: ${name}`, `${t('forecastEtaLabel', language)} ~${etaText}`],
        iconName: null,
        color: FORECAST_COLOR,
        onClick: () => openForecastWindow(),
    });
    logEvent(`Forecast notify: ${name} - ${typeName} (uid ${uid}, eta ~${etaText})`, 'INFO');
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
    const state = { predictedAt, lastNotifiedAt: previous ? previous.lastNotifiedAt : null };
    predictions.set(uid, state);

    const settings = settingsStore.getSettings();
    if (!settings.visualNotificationsEnabled || !settings.forecastNotifyEnabled) return null;

    const lookaheadMinutes = settings.forecastNotifyLookaheadMinutes || forecastConfig.NOTIFY_LOOKAHEAD_MINUTES;
    const lookaheadMs = lookaheadMinutes * 60 * 1000;
    if (soonest.projectedNextMs > lookaheadMs) return null;

    const cooldownMs = soonest.projectedNextMs / 2;
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

    const candidates = [];
    for (const uid of selectedUids) {
        try {
            const candidate = await evaluateRegion(uid, language);
            if (candidate) candidates.push(candidate);
        } catch (err) {
            logEvent(`Forecast watcher error for uid ${uid}: ${err.message}`, 'ERROR');
        }
    }

    candidates.sort((a, b) => a.etaMs - b.etaMs);
    const now = Date.now();

    candidates.slice(0, MAX_SIMULTANEOUS_FORECAST_NOTIFICATIONS).forEach(({ uid, alertType, etaMs, state }) => {
        notifyApproaching(uid, alertType, etaMs, language);
        predictions.set(uid, { ...state, lastNotifiedAt: now });
    });
}

function startForecastWatcher() {
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

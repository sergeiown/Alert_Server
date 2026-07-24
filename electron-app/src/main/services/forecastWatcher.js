const { logEvent } = require('./logger');
const regionsStore = require('./regionsStore');
const settingsStore = require('./settingsStore');
const forecastConfig = require('./forecastConfig');
const { DAY_MS, MIN_MEANINGFUL_LAMBDA } = require('./forecastModel');
const { getRegionLambda, getRegionTypeLambdas } = require('./forecast');
const { getLatestAlertData } = require('./alertPoller');
const { getLocationLookup } = require('./locationFilter');
const { alertTypeName } = require('./alertTypes');
const { notifyWithMap } = require('./notifier');
const { openForecastWindow } = require('../windows/forecastWindow');
const { t } = require('../../i18n/i18n');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const FORECAST_COLOR = '#2563eb';

const predictions = new Map();

function isRegionActive(uid) {
    const activeData = getLatestAlertData();
    return Boolean(activeData && activeData.alerts.some((alert) => String(alert.location_uid) === String(uid)));
}

function regionName(uid, language) {
    const info = getLocationLookup().get(String(uid));
    return info ? (language === 'English' ? info.lat : info.name) : String(uid);
}

function notifyApproaching(uid, alertType, probability, lookaheadMinutes, language) {
    const name = regionName(uid, language);
    const typeName = alertTypeName(alertType, language);
    const title = `${t('forecastNotifyTitle', language)}: ${typeName}`;
    const percent = Math.round(probability * 100);

    notifyWithMap({
        uid,
        title,
        bodyLines: [
            `${t('location', language)}: ${name}`,
            `${t('forecastNotifyProbabilityLabel', language)} ${lookaheadMinutes} ${t('unitMinute', language)}: ${percent}%`,
        ],
        iconName: null,
        color: FORECAST_COLOR,
        onClick: () => openForecastWindow(),
    });
    logEvent(`Forecast notify: ${name} - ${typeName} (uid ${uid}, ${percent}% within ${lookaheadMinutes}m)`);
}

async function checkRegion(uid, language) {
    if (isRegionActive(uid)) {
        predictions.delete(uid);
        return;
    }

    const lambda = await getRegionLambda(uid);
    if (!lambda || lambda <= MIN_MEANINGFUL_LAMBDA) {
        predictions.delete(uid);
        return;
    }

    const now = Date.now();
    const predictedAt = now + (1 / lambda) * DAY_MS;
    const previous = predictions.get(uid);
    const state = { predictedAt, lastNotifiedAt: previous ? previous.lastNotifiedAt : null };
    predictions.set(uid, state);

    const settings = settingsStore.getSettings();
    if (!settings.visualNotificationsEnabled || !settings.forecastNotifyEnabled) return;

    const lookaheadMinutes = settings.forecastNotifyLookaheadMinutes || forecastConfig.NOTIFY_LOOKAHEAD_MINUTES;
    const lookaheadDays = lookaheadMinutes / (60 * 24);

    const typeLambdas = await getRegionTypeLambdas(uid);
    if (!typeLambdas.length) return;

    const [likeliest] = typeLambdas
        .map((entry) => ({ ...entry, probability: 1 - Math.exp(-entry.lambda * lookaheadDays) }))
        .sort((a, b) => b.probability - a.probability);

    if (!likeliest || likeliest.probability < forecastConfig.NOTIFY_PROBABILITY_THRESHOLD) return;

    const cooldownMs = forecastConfig.NOTIFY_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (state.lastNotifiedAt && now - state.lastNotifiedAt < cooldownMs) return;

    notifyApproaching(uid, likeliest.type, likeliest.probability, lookaheadMinutes, language);
    predictions.set(uid, { ...state, lastNotifiedAt: now });
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

    for (const uid of selectedUids) {
        try {
            await checkRegion(uid, language);
        } catch (err) {
            logEvent(`Forecast watcher error for uid ${uid}: ${err.message}`);
        }
    }
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

const { logEvent } = require('./logger');
const regionsStore = require('./regionsStore');
const settingsStore = require('./settingsStore');
const forecastConfig = require('./forecastConfig');
const { DAY_MS, MIN_MEANINGFUL_LAMBDA } = require('./forecastModel');
const { getRegionLambda } = require('./forecast');
const { getLatestAlertData } = require('./alertPoller');
const { getLocationLookup } = require('./locationFilter');
const { createNotification } = require('./notifier');
const { openForecastWindow } = require('../windows/forecastWindow');
const { t } = require('../../i18n/i18n');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const predictions = new Map();

function isRegionActive(uid) {
    const activeData = getLatestAlertData();
    return Boolean(activeData && activeData.alerts.some((alert) => String(alert.location_uid) === String(uid)));
}

function regionName(uid, language) {
    const info = getLocationLookup().get(String(uid));
    return info ? (language === 'English' ? info.lat : info.name) : String(uid);
}

function notifyApproaching(uid, language) {
    const name = regionName(uid, language);
    const title = t('forecastNotifyTitle', language);
    createNotification(title, `${name}: ${t('forecastNotifyBody', language)}`, 'app-icon-256.png', () =>
        openForecastWindow()
    );
    logEvent(`Forecast notify: ${name} (uid ${uid})`);
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

    if (!settingsStore.getSettings().forecastNotifyEnabled) return;

    const lookaheadMs = forecastConfig.NOTIFY_LOOKAHEAD_MINUTES * 60 * 1000;
    const cooldownMs = forecastConfig.NOTIFY_COOLDOWN_HOURS * 60 * 60 * 1000;

    if (predictedAt < now || predictedAt > now + lookaheadMs) return;
    if (state.lastNotifiedAt && now - state.lastNotifiedAt < cooldownMs) return;

    notifyApproaching(uid, language);
    predictions.set(uid, { ...state, lastNotifiedAt: now });
}

async function runCheck() {
    const { language } = settingsStore.getSettings();
    for (const uid of regionsStore.getSelectedUids()) {
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

module.exports = { startForecastWatcher, getUpcomingPredictions };

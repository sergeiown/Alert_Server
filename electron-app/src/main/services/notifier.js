const fs = require('fs');
const { Notification, dialog } = require('electron');
const { getUserDataFile, getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');
const settingsStore = require('./settingsStore');
const { playAlertSound, playAlertCancellationSound } = require('./audioPlayer');
const { t } = require('../../i18n/i18n');

let alertTypes = null;
let displayedAlerts = null;
const activeNotifications = new Set();

function getAlertTypes() {
    if (!alertTypes) {
        alertTypes = JSON.parse(fs.readFileSync(getResourcePath('data', 'alertTypes.json'), 'utf-8'));
    }
    return alertTypes;
}

function ensureDisplayedAlertsLoaded() {
    if (displayedAlerts) return;

    displayedAlerts = new Map();
    const filePath = getUserDataFile('alert_displayed.json');
    if (fs.existsSync(filePath)) {
        const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        saved.forEach((alert) => displayedAlerts.set(alert.id, alert));
    }
}

function saveDisplayedAlerts() {
    const alertsArray = Array.from(displayedAlerts.entries()).map(([id, value]) => ({ id, ...value }));
    fs.writeFileSync(getUserDataFile('alert_displayed.json'), JSON.stringify(alertsArray, null, 2), 'utf-8');
}

function alertTypeName(alertTypeId, language) {
    const type = getAlertTypes().find((entry) => entry.id === alertTypeId);
    if (!type) return alertTypeId;
    return language === 'English' ? type.id : type.name;
}

function formatStartedAt(startedAt, language) {
    if (!startedAt) return null;
    const locale = language === 'English' ? 'en-US' : 'uk-UA';
    return new Date(startedAt).toLocaleString(locale);
}

function playRepeated(playFn, language, count, intervalMs) {
    for (let i = 0; i < count; i++) {
        setTimeout(() => playFn(language), i * intervalMs);
    }
}

function createNotification(title, body, iconName, onClick) {
    const icon = getResourcePath('icons', iconName);
    const notification = new Notification({ title, body, icon });

    activeNotifications.add(notification);
    const release = () => activeNotifications.delete(notification);

    notification.on('click', () => {
        if (onClick) onClick();
        release();
    });
    notification.on('close', release);
    notification.on('failed', release);

    notification.show();
}

function showAlertDetails(title, language, locationName, typeName, startedAt) {
    const startedAtText = formatStartedAt(startedAt, language);
    dialog.showMessageBox({
        type: 'info',
        title,
        message: `${t('alertStarted', language)}: ${typeName}`,
        detail: [
            `${t('location', language)}: ${locationName}`,
            startedAtText ? `${t('alertStartedAt', language)}: ${startedAtText}` : null,
        ]
            .filter(Boolean)
            .join('\n'),
    });
}

function processAlerts(matchedAlerts) {
    ensureDisplayedAlertsLoaded();

    const settings = settingsStore.getSettings();
    const language = settings.language;
    const alertCount = matchedAlerts.length;

    matchedAlerts.forEach((alert) => {
        if (displayedAlerts.has(alert.id)) return;

        const typeName = alertTypeName(alert.alert_type, language);
        const locationName = language === 'English' ? alert.location_lat : alert.location_title;
        const title = `${t('alertStarted', language)}: ${typeName}`;
        const body = `${t('location', language)}: ${locationName}. ${t('activeInMonitored', language)}: ${alertCount}`;

        createNotification(title, body, 'alert.png', () =>
            showAlertDetails(title, language, locationName, typeName, alert.started_at)
        );

        if (settings.alertSound) {
            playRepeated(playAlertSound, language, settings.alertSoundCount, 8000);
        }

        logEvent(`Alert ${alert.alert_type}: ${locationName}`);

        displayedAlerts.set(alert.id, {
            locationTitle: alert.location_title,
            locationLat: alert.location_lat,
            alertType: alert.alert_type,
            startedAt: alert.started_at,
        });
        saveDisplayedAlerts();
    });

    displayedAlerts.forEach((value, id) => {
        if (matchedAlerts.some((alert) => alert.id === id)) return;

        const typeName = alertTypeName(value.alertType, language);
        const locationName = language === 'English' ? value.locationLat : value.locationTitle;
        const title = `${t('alertCancelled', language)}: ${typeName}`;
        const body = `${t('location', language)}: ${locationName}. ${t('activeInMonitored', language)}: ${alertCount}`;

        createNotification(title, body, 'cancel.png', () =>
            showAlertDetails(title, language, locationName, typeName, value.startedAt)
        );

        if (settings.alertSound) {
            playRepeated(playAlertCancellationSound, language, settings.alertSoundCount, 6000);
        }

        logEvent(`Alert cancelled: ${locationName}`);

        displayedAlerts.delete(id);
        saveDisplayedAlerts();
    });
}

function getActiveCount() {
    ensureDisplayedAlertsLoaded();
    return displayedAlerts.size;
}

module.exports = { processAlerts, getActiveCount };

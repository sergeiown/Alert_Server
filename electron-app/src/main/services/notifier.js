const fs = require('fs');
const { Notification } = require('electron');
const { getUserDataFile, getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');
const settingsStore = require('./settingsStore');
const { playAlertSound, playAlertCancellationSound } = require('./audioPlayer');
const { t } = require('../../i18n/i18n');

let alertTypes = null;
let displayedAlerts = null;

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

function createNotification(title, body, iconName) {
    const icon = getResourcePath('icons', iconName);
    new Notification({ title, body, icon }).show();
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

        createNotification(title, body, 'alert.png');

        if (settings.alertSound) {
            playAlertSound(language);
            setTimeout(() => playAlertSound(language), 8000);
        }

        logEvent(`Alert ${alert.alert_type}: ${locationName}`);

        displayedAlerts.set(alert.id, {
            locationTitle: alert.location_title,
            locationLat: alert.location_lat,
            alertType: alert.alert_type,
        });
        saveDisplayedAlerts();
    });

    displayedAlerts.forEach((value, id) => {
        if (matchedAlerts.some((alert) => alert.id === id)) return;

        const typeName = alertTypeName(value.alertType, language);
        const locationName = language === 'English' ? value.locationLat : value.locationTitle;
        const title = `${t('alertCancelled', language)}: ${typeName}`;
        const body = `${t('location', language)}: ${locationName}. ${t('activeInMonitored', language)}: ${alertCount}`;

        createNotification(title, body, 'cancel.png');

        if (settings.alertSound) {
            playAlertCancellationSound(language);
            setTimeout(() => playAlertCancellationSound(language), 6000);
        }

        logEvent(`Alert cancelled: ${locationName}`);

        displayedAlerts.delete(id);
        saveDisplayedAlerts();
    });
}

module.exports = { processAlerts };

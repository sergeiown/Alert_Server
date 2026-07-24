const fs = require('fs');
const { Notification, dialog } = require('electron');
const { getUserDataFile, getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');
const settingsStore = require('./settingsStore');
const { playAlertSound, playAlertCancellationSound } = require('./audioPlayer');
const { alertTypeName } = require('./alertTypes');
const { getHistoryFetchTarget } = require('./locationFilter');
const { renderRegionMapImage } = require('./notificationMap');
const { formatDuration } = require('./forecast');
const { t } = require('../../i18n/i18n');

const ALERT_COLOR = '#dc2626';
const CANCEL_COLOR = '#16a34a';

let displayedAlerts = null;
let isInitialSync = false;
const activeNotifications = new Set();

function ensureDisplayedAlertsLoaded() {
    if (displayedAlerts) return;

    displayedAlerts = new Map();
    isInitialSync = true;
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

function formatStartedAt(startedAt, language) {
    if (!startedAt) return null;
    const locale = language === 'English' ? 'en-US' : 'uk-UA';
    return new Date(startedAt).toLocaleString(locale);
}

function playRepeated(playFn, mode, language, count, intervalMs) {
    for (let i = 0; i < count; i++) {
        setTimeout(() => playFn(mode, language), i * intervalMs);
    }
}

function createNotification(title, body, iconName, onClick) {
    const options = { title, body };
    if (iconName) options.icon = getResourcePath('icons', iconName);
    const notification = new Notification(options);

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

function escapeXml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function toFileUri(filePath) {
    return `file:///${filePath.replace(/\\/g, '/')}`;
}

function buildToastXml({ title, bodyLines, heroImagePath, iconName }) {
    const logoTag = iconName
        ? `<image placement="appLogoOverride" src="${toFileUri(getResourcePath('icons', iconName))}"/>`
        : '';
    const heroTag = heroImagePath ? `<image placement="hero" src="${toFileUri(heroImagePath)}"/>` : '';
    const textTags = [title, ...bodyLines].map((line) => `<text>${escapeXml(line)}</text>`).join('');

    return `<toast duration="long"><visual><binding template="ToastGeneric">${logoTag}${heroTag}${textTags}</binding></visual></toast>`;
}

function createRichNotification({ title, bodyLines, heroImagePath, iconName, onClick }) {
    const notification = new Notification({ toastXml: buildToastXml({ title, bodyLines, heroImagePath, iconName }) });

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

async function notifyWithMap({ uid, title, bodyLines, iconName, color, onClick }) {
    let heroImagePath = null;
    const target = getHistoryFetchTarget(uid);

    if (target) {
        try {
            heroImagePath = await renderRegionMapImage(target.stateUid, color);
        } catch (err) {
            logEvent(`Notification map render failed: ${err.message}`);
        }
    }

    createRichNotification({ title, bodyLines, heroImagePath, iconName, onClick });
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

function processAlerts(matchedAlerts, allAlerts) {
    ensureDisplayedAlertsLoaded();

    const skipCancellationNotice = isInitialSync;
    isInitialSync = false;

    const settings = settingsStore.getSettings();
    const language = settings.language;
    const alertCount = matchedAlerts.length;

    matchedAlerts.forEach((alert) => {
        if (displayedAlerts.has(alert.id)) return;

        const typeName = alertTypeName(alert.alert_type, language);
        const locationName = language === 'English' ? alert.location_lat : alert.location_title;
        const title = `${t('alertStarted', language)}: ${typeName}`;
        const startedAtText = formatStartedAt(alert.started_at, language);

        if (settings.visualNotificationsEnabled && settings.activeAlertNotifyEnabled) {
            notifyWithMap({
                uid: alert.location_uid,
                title,
                bodyLines: [
                    `${t('location', language)}: ${locationName}`,
                    `${t('activeInMonitored', language)}: ${alertCount}`,
                    startedAtText ? `${t('alertStartedAt', language)}: ${startedAtText}` : null,
                    alert.notes ? `${t('alertSource', language)}: ${alert.notes}` : null,
                ].filter(Boolean),
                iconName: 'alert.png',
                color: ALERT_COLOR,
                onClick: () => showAlertDetails(title, language, locationName, typeName, alert.started_at),
            });
        }

        if (settings.alertSoundMode !== 'none') {
            playRepeated(playAlertSound, settings.alertSoundMode, language, settings.alertSoundCount, 8000);
        }

        logEvent(`Alert ${alert.alert_type}: ${locationName}`);

        displayedAlerts.set(alert.id, {
            locationUid: alert.location_uid,
            locationTitle: alert.location_title,
            locationLat: alert.location_lat,
            alertType: alert.alert_type,
            startedAt: alert.started_at,
        });
        saveDisplayedAlerts();
    });

    displayedAlerts.forEach((value, id) => {
        if (matchedAlerts.some((alert) => alert.id === id)) return;

        displayedAlerts.delete(id);
        saveDisplayedAlerts();

        const stillActiveElsewhere = allAlerts.some((alert) => alert.id === id);
        if (skipCancellationNotice || stillActiveElsewhere) return;

        const typeName = alertTypeName(value.alertType, language);
        const locationName = language === 'English' ? value.locationLat : value.locationTitle;
        const title = `${t('alertCancelled', language)}: ${typeName}`;
        const durationText = value.startedAt
            ? formatDuration(Date.now() - new Date(value.startedAt).getTime(), language)
            : null;

        if (settings.visualNotificationsEnabled && settings.activeAlertNotifyEnabled) {
            notifyWithMap({
                uid: value.locationUid,
                title,
                bodyLines: [
                    `${t('location', language)}: ${locationName}`,
                    `${t('activeInMonitored', language)}: ${alertCount}`,
                    durationText ? `${t('alertDuration', language)}: ${durationText}` : null,
                ].filter(Boolean),
                iconName: 'cancel.png',
                color: CANCEL_COLOR,
                onClick: () => showAlertDetails(title, language, locationName, typeName, value.startedAt),
            });
        }

        if (settings.alertSoundMode !== 'none') {
            playRepeated(playAlertCancellationSound, settings.alertSoundMode, language, settings.alertSoundCount, 6000);
        }

        logEvent(`Alert cancelled: ${locationName}`);
    });
}

function getActiveCount() {
    ensureDisplayedAlertsLoaded();
    return displayedAlerts.size;
}

module.exports = { processAlerts, getActiveCount, createNotification, notifyWithMap };

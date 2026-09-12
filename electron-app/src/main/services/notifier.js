// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { Notification, dialog } = require('electron');
const { getUserDataFile, getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');
const settingsStore = require('./settingsStore');
const regionsStore = require('./regionsStore');
const { playAlertSound, playAlertCancellationSound } = require('./audioPlayer');
const { alertTypeName } = require('./alertTypes');
const { getHistoryFetchTarget } = require('./locationFilter');
const { renderRegionMapImage } = require('./notificationMap');
const { formatDuration } = require('./forecast');
const { levelColor, worstLevelAmong, describeThreats } = require('./alertLevels');
const { KYIV_CITY_UID } = require('./regionAlertStatus');
const { transliterate } = require('./transliterate');
const { t } = require('../../i18n/i18n');
const { openLiveMapWindow, openLiveMapWindowInKyivMode } = require('../windows/liveMapWindow');

const ALERT_COLOR = '#dc2626';
const CANCEL_COLOR = '#16a34a';
const MASS_ALERT_THRESHOLD = 2;

const STALE_ON_FIRST_SIGHT_MS = 5 * 60 * 1000;

let displayedAlerts = null;
let isInitialSync = false;
const activeNotifications = new Set();

let displayedKyivDistricts = null;
let isKyivDistrictInitialSync = false;

function openConfiguredLiveMap() {
    const selectedUids = regionsStore.getSelectedUids().map(String);
    const kyivOnly = selectedUids.length === 1 && selectedUids[0] === String(KYIV_CITY_UID);

    if (kyivOnly) openLiveMapWindowInKyivMode();
    else openLiveMapWindow();
}

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

function ensureDisplayedKyivDistrictsLoaded() {
    if (displayedKyivDistricts) return;

    displayedKyivDistricts = new Map();
    isKyivDistrictInitialSync = true;
    const filePath = getUserDataFile('kyiv_district_displayed.json');
    if (fs.existsSync(filePath)) {
        const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        saved.forEach((district) => displayedKyivDistricts.set(district.name, district));
    }
}

function saveDisplayedKyivDistricts() {
    const districtsArray = Array.from(displayedKyivDistricts.entries()).map(([name, value]) => ({ name, ...value }));
    fs.writeFileSync(getUserDataFile('kyiv_district_displayed.json'), JSON.stringify(districtsArray, null, 2), 'utf-8');
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

async function notifyWithMap({ uid, uids, title, bodyLines, iconName, color, onClick }) {
    let heroImagePath = null;
    const stateUids = [...new Set((uids || [uid]).map((u) => getHistoryFetchTarget(u)?.stateUid).filter(Boolean))];

    if (stateUids.length) {
        try {
            heroImagePath = await renderRegionMapImage(stateUids, color);
        } catch (err) {
            logEvent(`Notification map render failed: ${err.message}`, 'ERROR');
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
    const canNotify = settings.visualNotificationsEnabled && settings.activeAlertNotifyEnabled;

    const newAlerts = matchedAlerts.filter((alert) => !displayedAlerts.has(alert.id));
    const isStaleOnFirstSight = (alert) => Date.now() - new Date(alert.started_at).getTime() > STALE_ON_FIRST_SIGHT_MS;
    const freshNewAlerts = newAlerts.filter((alert) => !isStaleOnFirstSight(alert));
    const massStart = freshNewAlerts.length > MASS_ALERT_THRESHOLD;

    if (freshNewAlerts.length && canNotify && settings.showLiveMapOnAlert) {
        openConfiguredLiveMap();
    }

    if (massStart && canNotify) {
        notifyWithMap({
            uids: freshNewAlerts.map((alert) => alert.location_uid),
            title: t('massAlertStartTitle', language).replace('{count}', freshNewAlerts.length),
            bodyLines: [`${t('activeInMonitored', language)}: ${alertCount}`],
            iconName: 'alert.png',
            color: levelColor(worstLevelAmong(freshNewAlerts)),
        });
    }

    newAlerts.forEach((alert) => {
        const stale = isStaleOnFirstSight(alert);
        const typeName = alertTypeName(alert.alert_type, language);
        const locationName = language === 'English' ? alert.location_lat : alert.location_title;
        const title = `${t('alertStarted', language)}: ${typeName}`;
        const startedAtText = formatStartedAt(alert.started_at, language);

        if (!stale && !massStart && canNotify) {
            notifyWithMap({
                uid: alert.location_uid,
                title,
                bodyLines: [
                    `${t('location', language)}: ${locationName}`,
                    `${t('activeInMonitored', language)}: ${alertCount}`,
                    startedAtText ? `${t('alertStartedAt', language)}: ${startedAtText}` : null,
                    describeThreats(alert.threats, language),
                    alert.notes ? `${t('alertSource', language)}: ${alert.notes}` : null,
                ]
                    .filter(Boolean)
                    .flatMap((line) => line.split('\n')),
                iconName: 'alert.png',
                color: levelColor(alert.alert_level),
                onClick: () => showAlertDetails(title, language, locationName, typeName, alert.started_at),
            });
        }

        if (!stale && settings.alertSoundMode !== 'none') {
            playRepeated(playAlertSound, settings.alertSoundMode, language, settings.alertSoundCount, 8000);
        }

        const levelSuffix = alert.alert_level ? ` [${alert.alert_level}]` : '';
        logEvent(`Alert ${alert.alert_type}${levelSuffix}: ${alert.location_lat || alert.location_title}${stale ? ' (already active before this check)' : ''}`, 'ALERT');

        displayedAlerts.set(alert.id, {
            locationUid: alert.location_uid,
            locationTitle: alert.location_title,
            locationLat: alert.location_lat,
            alertType: alert.alert_type,
            startedAt: alert.started_at,
        });
        saveDisplayedAlerts();
    });

    const newlyCancelled = [];
    displayedAlerts.forEach((value, id) => {
        if (matchedAlerts.some((alert) => alert.id === id)) return;

        displayedAlerts.delete(id);
        saveDisplayedAlerts();

        const stillActiveElsewhere = allAlerts.some((alert) => alert.id === id);
        if (skipCancellationNotice || stillActiveElsewhere) return;

        newlyCancelled.push(value);
    });

    const massCancel = newlyCancelled.length > MASS_ALERT_THRESHOLD;

    if (massCancel && canNotify) {
        notifyWithMap({
            uids: newlyCancelled.map((value) => value.locationUid),
            title: t('massAlertCancelTitle', language).replace('{count}', newlyCancelled.length),
            bodyLines: [`${t('activeInMonitored', language)}: ${alertCount}`],
            iconName: 'cancel.png',
            color: CANCEL_COLOR,
        });
    }

    newlyCancelled.forEach((value) => {
        const typeName = alertTypeName(value.alertType, language);
        const locationName = language === 'English' ? value.locationLat : value.locationTitle;
        const title = `${t('alertCancelled', language)}: ${typeName}`;
        const durationText = value.startedAt
            ? formatDuration(Date.now() - new Date(value.startedAt).getTime(), language)
            : null;

        if (!massCancel && canNotify) {
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

        logEvent(`Alert cancelled: ${value.locationLat || value.locationTitle}`, 'ALERT');
    });
}

function kyivDistrictDisplayName(name, language) {
    return language === 'English' ? `${transliterate(name)} District` : `${name} район`;
}

function kyivDistrictThreatLines(threats, language) {
    return (threats || []).map((threat) => {
        const levelLabel = threat.level === 'red' ? t('alertLevelRed', language) : t('alertLevelYellow', language);
        return `${threat.description} (${levelLabel})`;
    });
}

function processKyivDistricts(kyivRaions) {
    ensureDisplayedKyivDistrictsLoaded();

    const skipCancellationNotice = isKyivDistrictInitialSync;
    isKyivDistrictInitialSync = false;

    const selectedUids = new Set(regionsStore.getSelectedUids().map(String));
    if (!selectedUids.has(String(KYIV_CITY_UID))) return;

    const settings = settingsStore.getSettings();
    const language = settings.language;
    const canNotify = settings.visualNotificationsEnabled && settings.activeAlertNotifyEnabled;

    const current = new Map((kyivRaions || []).map((district) => [district.name, district]));
    const isStaleOnFirstSight = (district) => Date.now() - new Date(district.startedAt).getTime() > STALE_ON_FIRST_SIGHT_MS;

    const newDistricts = [];
    current.forEach((district, name) => {
        if (!displayedKyivDistricts.has(name)) newDistricts.push(district);
    });
    const freshNewDistricts = newDistricts.filter((district) => !isStaleOnFirstSight(district));
    const massStart = freshNewDistricts.length > MASS_ALERT_THRESHOLD;

    if (freshNewDistricts.length && canNotify && settings.showLiveMapOnAlert) {
        openConfiguredLiveMap();
    }

    if (massStart && canNotify) {
        notifyWithMap({
            uid: KYIV_CITY_UID,
            title: t('massKyivDistrictAlertStartTitle', language).replace('{count}', freshNewDistricts.length),
            bodyLines: [],
            iconName: 'alert.png',
            color: levelColor(worstLevelAmong(freshNewDistricts.map((district) => ({ alert_level: district.alertLevel })))),
        });
    }

    newDistricts.forEach((district) => {
        const stale = isStaleOnFirstSight(district);
        const displayName = kyivDistrictDisplayName(district.name, language);
        const startedAtText = formatStartedAt(district.startedAt, language);

        if (!stale && !massStart && canNotify) {
            notifyWithMap({
                uid: KYIV_CITY_UID,
                title: `${t('alertStarted', language)}: ${displayName}`,
                bodyLines: [
                    ...kyivDistrictThreatLines(district.threats, language),
                    startedAtText ? `${t('alertStartedAt', language)}: ${startedAtText}` : null,
                ].filter(Boolean),
                iconName: 'alert.png',
                color: levelColor(district.alertLevel),
            });
        }

        logEvent(
            `Kyiv district alert: ${district.name}${district.alertLevel ? ` [${district.alertLevel}]` : ''}${stale ? ' (already active before this check)' : ''}`,
            'ALERT'
        );

        displayedKyivDistricts.set(district.name, { startedAt: district.startedAt, alertLevel: district.alertLevel });
        saveDisplayedKyivDistricts();
    });

    const newlyEnded = [];
    displayedKyivDistricts.forEach((value, name) => {
        if (current.has(name)) return;

        displayedKyivDistricts.delete(name);
        saveDisplayedKyivDistricts();

        if (!skipCancellationNotice) newlyEnded.push({ name, ...value });
    });

    const massCancel = newlyEnded.length > MASS_ALERT_THRESHOLD;

    if (massCancel && canNotify) {
        notifyWithMap({
            uid: KYIV_CITY_UID,
            title: t('massKyivDistrictAlertCancelTitle', language).replace('{count}', newlyEnded.length),
            bodyLines: [],
            iconName: 'cancel.png',
            color: CANCEL_COLOR,
        });
    }

    newlyEnded.forEach((value) => {
        const displayName = kyivDistrictDisplayName(value.name, language);
        const durationText = value.startedAt
            ? formatDuration(Date.now() - new Date(value.startedAt).getTime(), language)
            : null;

        if (!massCancel && canNotify) {
            notifyWithMap({
                uid: KYIV_CITY_UID,
                title: `${t('alertCancelled', language)}: ${displayName}`,
                bodyLines: [durationText ? `${t('alertDuration', language)}: ${durationText}` : null].filter(Boolean),
                iconName: 'cancel.png',
                color: CANCEL_COLOR,
            });
        }

        logEvent(`Kyiv district alert cancelled: ${value.name}`, 'ALERT');
    });
}

function getActiveCount() {
    ensureDisplayedAlertsLoaded();
    return displayedAlerts.size;
}

module.exports = { processAlerts, processKyivDistricts, getActiveCount, createNotification, notifyWithMap };

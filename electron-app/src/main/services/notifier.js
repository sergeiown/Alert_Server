// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { Notification, dialog } = require('electron');
const { getUserDataFile, getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');
const settingsStore = require('./settingsStore');
const regionsStore = require('./regionsStore');
const { playAlertSound, playAlertCancellationSound, playLevelUpSound, playLevelDownSound } = require('./audioPlayer');
const { alertTypeName } = require('./alertTypes');
const { getHistoryFetchTarget } = require('./locationFilter');
const { renderRegionMapImage } = require('./notificationMap');
const { formatDuration } = require('./forecast');
const { levelColor, levelRank, worstLevelAmong, describeThreats, threatKey } = require('./alertLevels');
const { diffAlerts } = require('./alertDiff');
const { KYIV_CITY_UID } = require('./regionAlertStatus');
const { transliterate } = require('./transliterate');
const { t } = require('../../i18n/i18n');
const { openLiveMapWindow, openLiveMapWindowInKyivMode } = require('../windows/liveMapWindow');

const ALERT_COLOR = '#dc2626';
const CANCEL_COLOR = '#16a34a';
const MASS_ALERT_THRESHOLD = 2;

const STALE_ON_FIRST_SIGHT_MS = 5 * 60 * 1000;

let displayedAlerts = null;
const displayedAlertsJson = { value: null };
const displayedKyivDistrictsJson = { value: null };
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

function formatStartedAt(startedAt, language) {
    if (!startedAt) return null;
    const locale = language === 'English' ? 'en-US' : 'uk-UA';
    return new Date(startedAt).toLocaleString(locale);
}

function describeDurationRange(entries, language) {
    const durations = entries
        .filter((entry) => entry.startedAt)
        .map((entry) => Date.now() - new Date(entry.startedAt).getTime())
        .filter((ms) => Number.isFinite(ms) && ms >= 0);
    if (!durations.length) return [];

    const shortest = Math.min(...durations);
    const longest = Math.max(...durations);
    const label = t('alertDuration', language);
    if (formatDuration(shortest, language) === formatDuration(longest, language)) {
        return [`${label}: ${formatDuration(longest, language)}`];
    }
    return [`${label}: ${formatDuration(shortest, language)} - ${formatDuration(longest, language)}`];
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
    return notification;
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

    return createRichNotification({ title, bodyLines, heroImagePath, iconName, onClick });
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

function levelLabel(level, language) {
    if (level === 'red') return t('alertLevelRed', language);
    if (level === 'yellow') return t('alertLevelYellow', language);
    return null;
}

function levelShort(level, language) {
    if (level === 'red') return t('alertLevelShortRed', language);
    if (level === 'yellow') return t('alertLevelShortYellow', language);
    return '';
}

function startBodyLines(alert, locationName, alertCount, startedAtText, language) {
    const level = levelLabel(alert.alert_level, language);
    const threatText = describeThreats(alert.threats, language);
    const threatLines = threatText ? threatText.split('\n') : [];
    const countLine = `${t('activeInMonitored', language)}: ${alertCount}`;

    return [
        `${t('location', language)}: ${locationName}${level ? ` (${level})` : ''}`,
        threatLines[0] || countLine,
        threatLines[0] ? countLine : null,
        ...threatLines.slice(1),
        startedAtText ? `${t('alertStartedAt', language)}: ${startedAtText}` : null,
        alert.notes ? `${t('alertSource', language)}: ${alert.notes}` : null,
    ].filter(Boolean);
}

function iconForLevel(level) {
    return level === 'yellow' ? 'alert_yellow.png' : 'alert.png';
}

function durationLine(startedAt, language) {
    if (!startedAt) return null;
    const ms = Date.now() - new Date(startedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    return `${t('alertDuration', language)}: ${formatDuration(ms, language)}`;
}

function maxLevelLine(maxLevel, language) {
    const label = levelLabel(maxLevel, language);
    return label ? `${t('alertMaxLevel', language)}: ${label}` : null;
}

function levelChangeLine(from, to, language) {
    return t('alertLevelChangeLine', language)
        .replace('{from}', levelShort(from, language))
        .replace('{to}', levelLabel(to, language) || '');
}

function worstLevelOfEvents(events) {
    return events.reduce((worst, event) => (levelRank(event.to || event.entry.level) > levelRank(worst) ? event.to || event.entry.level : worst), null);
}

function persistSnapshot(entries, lastJsonRef, fileName, keyName) {
    const array = Array.from(entries.entries()).map(([id, value]) => {
        const { pending, ...rest } = value;
        return { [keyName]: id, ...rest };
    });
    const json = JSON.stringify(array, null, 2);
    if (json === lastJsonRef.value) return;
    lastJsonRef.value = json;
    fs.writeFileSync(getUserDataFile(fileName), json, 'utf-8');
}

function notifyLevelChanges(events, ctx) {
    const { settings, language } = ctx;
    if (!events.length || settings.alertLevelChangeNotifyEnabled === false) return;

    const massChange = events.length > MASS_ALERT_THRESHOLD;

    if (ctx.canNotify && massChange) {
        const count = (type) => events.filter((event) => event.type === type).length;
        const lines = [
            count('escalate') ? t('massLevelEscalatedLine', language).replace('{count}', count('escalate')) : null,
            count('deescalate') ? t('massLevelDeescalatedLine', language).replace('{count}', count('deescalate')) : null,
            count('addThreat') ? t('massLevelThreatAddedLine', language).replace('{count}', count('addThreat')) : null,
        ].filter(Boolean);
        const worst = worstLevelOfEvents(events);
        notifyWithMap({
            uids: ctx.uidsOf(events),
            title: t('massLevelChangeTitle', language).replace('{count}', events.length),
            bodyLines: lines,
            iconName: iconForLevel(worst),
            color: levelColor(worst),
        });
    }

    if (ctx.canNotify && !massChange) {
        events.forEach((event) => {
            const name = ctx.nameOf(event, language);
            const level = event.type === 'addThreat' ? event.entry.level : event.to;
            let title;
            let bodyLines;

            if (event.type === 'escalate') {
                title = `${t('alertLevelEscalatedTitle', language)}: ${name}`;
                bodyLines = [levelChangeLine(event.from, event.to, language), ...ctx.threatLines(event, false, language), durationLine(event.entry.startedAt, language)];
            } else if (event.type === 'deescalate') {
                title = `${t('alertLevelDeescalatedTitle', language)}: ${name}`;
                const first = event.from === 'red' && event.to === 'yellow' ? t('alertRedLevelLifted', language) : levelChangeLine(event.from, event.to, language);
                bodyLines = [first, ...ctx.threatLines(event, false, language), durationLine(event.entry.startedAt, language)];
            } else {
                title = `${t('alertThreatAddedTitle', language)}: ${name}`;
                const label = levelLabel(level, language);
                bodyLines = [
                    ...ctx.threatLines(event, true, language),
                    label ? `${t('alertCurrentLevel', language)}: ${label}` : null,
                    durationLine(event.entry.startedAt, language),
                ];
            }

            notifyWithMap({
                uid: ctx.uidOf(event),
                title,
                bodyLines: bodyLines.filter(Boolean),
                iconName: iconForLevel(level),
                color: levelColor(level),
                onClick: ctx.onClick ? () => ctx.onClick(event, title, language) : undefined,
            });
        });
    }

    if (settings.alertSoundMode !== 'none') {
        if (events.some((event) => event.type === 'escalate')) playLevelUpSound(settings.alertSoundMode);
        else if (events.some((event) => event.type === 'deescalate')) playLevelDownSound(settings.alertSoundMode);
    }

    events.forEach((event) => {
        logEvent(`${ctx.logLabel} level change: ${event.type}${event.from ? ` ${event.from}` : ''}${event.to ? ` -> ${event.to}` : ''}: ${ctx.logName(event)}`, 'ALERT');
    });
}

function alertKey(alert) {
    return `${alert.location_uid}:${alert.alert_type}`;
}

function alertToItem(alert) {
    return {
        id: alertKey(alert),
        level: alert.alert_level,
        startedAt: alert.started_at,
        sig: (alert.threats || []).map(threatKey),
        meta: {
            locationUid: alert.location_uid,
            locationTitle: alert.location_title,
            locationLat: alert.location_lat,
            alertType: alert.alert_type,
        },
        raw: alert,
    };
}

function scheduleRecheck(state, ms, run) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (ms === null || ms === undefined) return;
    state.timer = setTimeout(run, ms + 250);
    if (typeof state.timer.unref === 'function') state.timer.unref();
}

const alertsRecheck = { timer: null, args: null };

function alertThreatLines(event, onlyAdded, language) {
    const threats = (event.item.raw.threats || []).filter((threat) => !onlyAdded || event.added.includes(threatKey(threat)));
    const text = describeThreats(threats, language);
    return text ? text.split('\n') : [];
}

function processAlerts(matchedAlerts, allAlerts) {
    ensureDisplayedAlertsLoaded();
    alertsRecheck.args = [matchedAlerts, allAlerts];

    const skipCancellationNotice = isInitialSync;
    isInitialSync = false;

    const settings = settingsStore.getSettings();
    const language = settings.language;
    const alertCount = matchedAlerts.length;
    const canNotify = settings.visualNotificationsEnabled && settings.activeAlertNotifyEnabled;

    const { events, nextSnapshot, nextCheckInMs } = diffAlerts(displayedAlerts, matchedAlerts.map(alertToItem), {
        staleOnFirstSightMs: STALE_ON_FIRST_SIGHT_MS,
    });
    displayedAlerts = nextSnapshot;
    persistSnapshot(displayedAlerts, displayedAlertsJson, 'alert_displayed.json', 'id');
    scheduleRecheck(alertsRecheck, nextCheckInMs, () => processAlerts(...alertsRecheck.args));

    const startEvents = events.filter((event) => event.type === 'start');
    const levelEvents = events.filter((event) => ['escalate', 'deescalate', 'addThreat'].includes(event.type));
    const endEvents = events.filter((event) => event.type === 'end');

    const freshStarts = startEvents.filter((event) => !event.stale);
    const massStart = freshStarts.length > MASS_ALERT_THRESHOLD;

    if (freshStarts.length && canNotify && settings.showLiveMapOnAlert) {
        openConfiguredLiveMap();
    }

    if (massStart && canNotify) {
        const worst = worstLevelAmong(freshStarts.map((event) => event.item.raw));
        notifyWithMap({
            uids: freshStarts.map((event) => event.item.raw.location_uid),
            title: t('massAlertStartTitle', language).replace('{count}', freshStarts.length),
            bodyLines: [`${t('activeInMonitored', language)}: ${alertCount}`],
            iconName: iconForLevel(worst),
            color: levelColor(worst),
        });
    }

    startEvents.forEach((event) => {
        const alert = event.item.raw;
        const stale = event.stale;
        const typeName = alertTypeName(alert.alert_type, language);
        const locationName = language === 'English' ? alert.location_lat : alert.location_title;
        const title = `${t('alertStarted', language)}: ${typeName}`;
        const startedAtText = formatStartedAt(alert.started_at, language);

        if (!stale && !massStart && canNotify) {
            notifyWithMap({
                uid: alert.location_uid,
                title,
                bodyLines: startBodyLines(alert, locationName, alertCount, startedAtText, language),
                iconName: iconForLevel(alert.alert_level),
                color: levelColor(alert.alert_level),
                onClick: () => showAlertDetails(title, language, locationName, typeName, alert.started_at),
            });
        }

        if (!stale && settings.alertSoundMode !== 'none') {
            playRepeated(playAlertSound, settings.alertSoundMode, language, settings.alertSoundCount, 8000);
        }

        const levelSuffix = alert.alert_level ? ` [${alert.alert_level}]` : '';
        logEvent(`Alert ${alert.alert_type}${levelSuffix}: ${alert.location_lat || alert.location_title}${stale ? ' (already active before this check)' : ''}`, 'ALERT');
    });

    notifyLevelChanges(levelEvents, {
        settings,
        language,
        canNotify,
        logLabel: 'Alert',
        uidOf: (event) => event.entry.locationUid,
        uidsOf: (list) => list.map((event) => event.entry.locationUid),
        nameOf: (event, lang) => (lang === 'English' ? event.entry.locationLat : event.entry.locationTitle),
        logName: (event) => event.entry.locationLat || event.entry.locationTitle,
        threatLines: alertThreatLines,
        onClick: (event, title, lang) => {
            const typeName = alertTypeName(event.entry.alertType, lang);
            const locationName = lang === 'English' ? event.entry.locationLat : event.entry.locationTitle;
            showAlertDetails(title, lang, locationName, typeName, event.entry.startedAt);
        },
    });

    const newlyCancelled = endEvents
        .filter((event) => !skipCancellationNotice && !allAlerts.some((alert) => alertKey(alert) === event.id))
        .map((event) => event.entry);

    const massCancel = newlyCancelled.length > MASS_ALERT_THRESHOLD;

    if (massCancel && canNotify) {
        notifyWithMap({
            uids: newlyCancelled.map((value) => value.locationUid),
            title: t('massAlertCancelTitle', language).replace('{count}', newlyCancelled.length),
            bodyLines: describeDurationRange(newlyCancelled, language),
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
                    durationText ? `${t('alertDuration', language)}: ${durationText}` : null,
                    maxLevelLine(value.maxLevel, language),
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
        const levelLabelText = threat.level === 'red' ? t('alertLevelRed', language) : t('alertLevelYellow', language);
        return `${threat.description} (${levelLabelText})`;
    });
}

function kyivDistrictToItem(district) {
    return {
        id: district.name,
        level: district.alertLevel,
        startedAt: district.startedAt,
        sig: (district.threats || []).map(threatKey),
        meta: { name: district.name },
        raw: district,
    };
}

const kyivRecheck = { timer: null, args: null };

function kyivThreatLines(event, onlyAdded, language) {
    const threats = (event.item.raw.threats || []).filter((threat) => !onlyAdded || event.added.includes(threatKey(threat)));
    return kyivDistrictThreatLines(threats, language);
}

function processKyivDistricts(kyivRaions) {
    ensureDisplayedKyivDistrictsLoaded();
    kyivRecheck.args = [kyivRaions];

    const skipCancellationNotice = isKyivDistrictInitialSync;
    isKyivDistrictInitialSync = false;

    const selectedUids = new Set(regionsStore.getSelectedUids().map(String));
    if (!selectedUids.has(String(KYIV_CITY_UID))) return;

    const settings = settingsStore.getSettings();
    const language = settings.language;
    const canNotify = settings.visualNotificationsEnabled && settings.activeAlertNotifyEnabled;

    const { events, nextSnapshot, nextCheckInMs } = diffAlerts(displayedKyivDistricts, (kyivRaions || []).map(kyivDistrictToItem), {
        staleOnFirstSightMs: STALE_ON_FIRST_SIGHT_MS,
    });
    displayedKyivDistricts = nextSnapshot;
    persistSnapshot(displayedKyivDistricts, displayedKyivDistrictsJson, 'kyiv_district_displayed.json', 'name');
    scheduleRecheck(kyivRecheck, nextCheckInMs, () => processKyivDistricts(...kyivRecheck.args));

    const startEvents = events.filter((event) => event.type === 'start');
    const levelEvents = events.filter((event) => ['escalate', 'deescalate', 'addThreat'].includes(event.type));
    const endEvents = events.filter((event) => event.type === 'end');

    const freshStarts = startEvents.filter((event) => !event.stale);
    const massStart = freshStarts.length > MASS_ALERT_THRESHOLD;

    if (freshStarts.length && canNotify && settings.showLiveMapOnAlert) {
        openConfiguredLiveMap();
    }

    if (massStart && canNotify) {
        const worst = worstLevelAmong(freshStarts.map((event) => ({ alert_level: event.item.raw.alertLevel })));
        notifyWithMap({
            uid: KYIV_CITY_UID,
            title: t('massKyivDistrictAlertStartTitle', language).replace('{count}', freshStarts.length),
            bodyLines: [],
            iconName: iconForLevel(worst),
            color: levelColor(worst),
        });
    }

    startEvents.forEach((event) => {
        const district = event.item.raw;
        const stale = event.stale;
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
                iconName: iconForLevel(district.alertLevel),
                color: levelColor(district.alertLevel),
            });
        }

        logEvent(
            `Kyiv district alert: ${district.name}${district.alertLevel ? ` [${district.alertLevel}]` : ''}${stale ? ' (already active before this check)' : ''}`,
            'ALERT'
        );
    });

    notifyLevelChanges(levelEvents, {
        settings,
        language,
        canNotify,
        logLabel: 'Kyiv district',
        uidOf: () => KYIV_CITY_UID,
        uidsOf: () => [KYIV_CITY_UID],
        nameOf: (event, lang) => kyivDistrictDisplayName(event.entry.name, lang),
        logName: (event) => event.entry.name,
        threatLines: kyivThreatLines,
    });

    const newlyEnded = skipCancellationNotice ? [] : endEvents.map((event) => ({ ...event.entry, name: event.id }));

    const massCancel = newlyEnded.length > MASS_ALERT_THRESHOLD;

    if (massCancel && canNotify) {
        notifyWithMap({
            uid: KYIV_CITY_UID,
            title: t('massKyivDistrictAlertCancelTitle', language).replace('{count}', newlyEnded.length),
            bodyLines: describeDurationRange(newlyEnded, language),
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
                bodyLines: [
                    durationText ? `${t('alertDuration', language)}: ${durationText}` : null,
                    maxLevelLine(value.maxLevel, language),
                ].filter(Boolean),
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

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { Notification } = require('electron');
const { getUserDataFile, getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');
const settingsStore = require('./settingsStore');
const regionsStore = require('./regionsStore');
const { soundFor, playFor, stopFor } = require('./audioPlayer');
const notifyProfile = require('./notifyProfile');
const windowsToastPolicy = require('./windowsToastPolicy');
const { alertTypeName } = require('./alertTypes');
const { getMapRegion } = require('./locationFilter');
const { renderRegionMapImage } = require('./notificationMap');
const { formatDuration } = require('./forecast');
const { levelColor, levelRank, worstLevelAmong, describeThreats, threatKey } = require('./alertLevels');
const { diffAlerts } = require('./alertDiff');
const { KYIV_CITY_UID } = require('./regionAlertStatus');
const { transliterate } = require('./transliterate');
const { t } = require('../../i18n/i18n');
const { createThrottle } = require('./notificationThrottle');

const ALERT_COLOR = '#dc2626';
const CANCEL_COLOR = '#16a34a';
const MASS_ALERT_THRESHOLD = 2;

const STALE_ON_FIRST_SIGHT_MS = 5 * 60 * 1000;
const LEVEL_GRACE_MS = 20000;
const LEVEL_GRACE_POLL_MS = 250;
const SOUND_SHOW_FALLBACK_MS = 2500;
let soundAfterShowMs = 1200;

function configureSound(overrides) {
    if (overrides && overrides.afterShowMs !== undefined) soundAfterShowMs = overrides.afterShowMs;
}
const DURATION_MS = { standard: 15000, brief: 7000 };
const MAX_EMERGENCY_OPEN = 3;
let urgentSupportedFlag = windowsToastPolicy.urgentSupported();

function emergencyScenario() {
    return urgentSupportedFlag ? 'urgent' : 'alarm';
}

function configureToasts(overrides) {
    if (overrides && overrides.urgentSupported !== undefined) urgentSupportedFlag = Boolean(overrides.urgentSupported);
}
const openEmergency = new Set();
const openByKey = new Map();

function profileOf(key) {
    return notifyProfile.resolve(settingsStore.getSettings().notifyProfile, key);
}

function effects(profile) {
    return { emergency: profile.emergency, autoCloseMs: profile.ms };
}

function startProfile(level) {
    return profileOf(level === 'yellow' ? 'startYellow' : 'startRed');
}

function summaryProfile(worst) {
    const profile = profileOf('digest');
    return { emergency: profile.emergency && worst === 'red', ms: profile.ms };
}

function closeToastsFor(key) {
    const entries = openByKey.get(key);
    if (!entries) return;
    Array.from(entries).forEach((entry) => entry.dismiss());
}

const DIGEST_NAME_LIMIT = 3;
const DIGEST_TITLE_KEY = { start: 'digestStartTitle', end: 'digestEndTitle', level: 'digestLevelTitle' };

let lastAlertActivityAt = 0;

function isAlertActivityRecent(withinMs) {
    return Date.now() - lastAlertActivityAt < withinMs;
}

function resolveSound(soundKind) {
    if (!soundKind) return null;
    const settings = settingsStore.getSettings();
    return soundFor(soundKind, settings.alertSoundMode, settings.language, settings.alertSoundCount, settings.alertSoundVolume);
}

function playStandalone(soundKind) {
    const spec = resolveSound(soundKind);
    if (spec) playFor(Symbol(soundKind), spec);
}

function digestSoundKind(kind, entries) {
    if (kind !== 'level') return kind;
    if (entries.some((entry) => entry.options.soundKind === 'up')) return 'up';
    if (entries.some((entry) => entry.options.soundKind === 'down')) return 'down';
    return null;
}

function showDigest(kind, entries) {
    const { language } = settingsStore.getSettings();
    const names = [...new Set(entries.map((entry) => entry.meta.name).filter(Boolean))];
    const listed = names.slice(0, DIGEST_NAME_LIMIT).join(', ');
    const rest = names.length - DIGEST_NAME_LIMIT;
    const locationsLine = `${t('digestLocationsLabel', language)}: ${listed}${rest > 0 ? ` ${t('digestAndMore', language).replace('{count}', rest)}` : ''}`;
    const worst = worstLevelAmong(entries.map((entry) => ({ alert_level: entry.meta.level })));
    const levelLine = kind === 'end' ? null : maxLevelLine(worst, language);
    const isEnd = kind === 'end';

    return notifyWithMapNow({
        uids: entries.map((entry) => entry.options.uid).filter((uid) => uid !== undefined),
        title: t(DIGEST_TITLE_KEY[kind], language).replace('{count}', entries.length),
        bodyLines: [names.length ? locationsLine : null, levelLine].filter(Boolean),
        iconName: isEnd ? 'cancel.png' : iconForLevel(worst),
        color: isEnd ? CANCEL_COLOR : levelColor(worst),
        onClick: listClick(
                language,
                t(DIGEST_TITLE_KEY[kind], language).replace('{count}', entries.length),
                entries.map((entry) => ({ name: entry.meta.name, level: kind === 'end' ? null : entry.meta.level, parts: entry.meta.typeName ? [entry.meta.typeName] : [] }))
            ),
        soundKind: digestSoundKind(kind, entries),
        ...effects(isEnd ? profileOf('end') : summaryProfile(worst)),
    });
}

let throttle = createThrottle({
    onDigest: showDigest,
    onSingle: (kind, entry) => notifyWithMapNow(entry.options),
});

function configureThrottle(overrides) {
    throttle.dispose();
    throttle = createThrottle({
        onDigest: showDigest,
        onSingle: (kind, entry) => notifyWithMapNow(entry.options),
        ...overrides,
    });
}

let displayedAlerts = null;
const displayedAlertsJson = { value: null };
const displayedKyivDistrictsJson = { value: null };
let isInitialSync = false;
const activeNotifications = new Set();

let displayedKyivDistricts = null;
let isKyivDistrictInitialSync = false;

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

function createNotification(title, body, iconName, onClick, autoCloseMs) {
    const options = { title, body };
    if (iconName) options.icon = getResourcePath('icons', iconName);
    const notification = new Notification(options);

    activeNotifications.add(notification);
    let closeTimer = null;
    const release = () => {
        clearTimeout(closeTimer);
        activeNotifications.delete(notification);
    };

    notification.on('click', () => {
        if (onClick) onClick();
        release();
    });
    notification.on('close', release);
    notification.on('failed', release);

    notification.show();
    if (autoCloseMs) {
        closeTimer = setTimeout(() => {
            try {
                notification.close();
            } catch (err) {}
            release();
        }, autoCloseMs);
        if (typeof closeTimer.unref === 'function') closeTimer.unref();
    }
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

function buildToastXml({ title, bodyLines, heroImagePath, iconName, silent, scenario }) {
    const logoTag = iconName
        ? `<image placement="appLogoOverride" src="${toFileUri(getResourcePath('icons', iconName))}"/>`
        : '';
    const heroTag = heroImagePath ? `<image placement="hero" src="${toFileUri(heroImagePath)}"/>` : '';
    const textTags = [title, ...bodyLines].map((line) => `<text>${escapeXml(line)}</text>`).join('');

    return `<toast duration="long"${scenario ? ` scenario="${scenario}"` : ''}><visual><binding template="ToastGeneric">${logoTag}${heroTag}${textTags}</binding></visual>${silent ? '<audio silent="true"/>' : ''}</toast>`;
}

function createRichNotification({ title, bodyLines, heroImagePath, iconName, onClick, silent, sound, emergency, autoCloseMs, closeKey }) {
    const asEmergency = Boolean(emergency) && openEmergency.size < MAX_EMERGENCY_OPEN;
    const notification = new Notification({
        toastXml: buildToastXml({ title, bodyLines, heroImagePath, iconName, silent: silent || Boolean(sound), scenario: asEmergency ? emergencyScenario() : null }),
    });

    activeNotifications.add(notification);
    if (asEmergency) openEmergency.add(notification);
    let closeTimer = null;
    const keyEntry = closeKey ? { dismiss: () => dismiss() } : null;
    if (keyEntry) {
        if (!openByKey.has(closeKey)) openByKey.set(closeKey, new Set());
        openByKey.get(closeKey).add(keyEntry);
    }

    let soundStarted = false;
    let released = false;
    let soundTimer = null;
    const startSound = () => {
        if (soundStarted) return;
        soundStarted = true;
        clearTimeout(fallbackTimer);
        if (!sound) return;
        soundTimer = setTimeout(() => {
            if (!released) playFor(notification, sound);
        }, soundAfterShowMs);
    };
    const fallbackTimer = sound ? setTimeout(startSound, SOUND_SHOW_FALLBACK_MS) : null;
    if (fallbackTimer && typeof fallbackTimer.unref === 'function') fallbackTimer.unref();

    const release = () => {
        released = true;
        clearTimeout(fallbackTimer);
        clearTimeout(soundTimer);
        clearTimeout(closeTimer);
        soundStarted = true;
        stopFor(notification);
        activeNotifications.delete(notification);
        openEmergency.delete(notification);
        if (keyEntry && openByKey.has(closeKey)) {
            openByKey.get(closeKey).delete(keyEntry);
            if (!openByKey.get(closeKey).size) openByKey.delete(closeKey);
        }
    };
    const dismiss = () => {
        try {
            notification.close();
        } catch (err) {}
        release();
    };

    notification.on('show', startSound);
    notification.on('click', () => {
        if (onClick) onClick();
        release();
    });
    notification.on('close', release);
    notification.on('failed', () => {
        if (sound && !soundStarted) playFor(Symbol('failed-toast'), sound);
        clearTimeout(fallbackTimer);
        soundStarted = true;
        activeNotifications.delete(notification);
        openEmergency.delete(notification);
    });

    notification.show();
    if (autoCloseMs) {
        closeTimer = setTimeout(dismiss, autoCloseMs);
        if (typeof closeTimer.unref === 'function') closeTimer.unref();
    }
    return notification;
}

async function notifyWithMap(options) {
    if (options.kind && !throttle.submit(options.kind, { options, meta: options.meta || {}, critical: Boolean(options.critical) })) return null;
    return notifyWithMapNow(options);
}

async function notifyWithMapNow({ uid, uids, title, bodyLines, iconName, color, onClick, silent, soundKind, emergency, autoCloseMs, closeKey }) {
    let heroImagePath = null;
    const regions = [...new Map((uids || [uid]).map((u) => getMapRegion(u)).filter(Boolean).map((region) => [JSON.stringify(region), region])).values()];

    if (regions.length) {
        try {
            heroImagePath = await renderRegionMapImage(regions, color);
        } catch (err) {
            logEvent(`Notification map render failed: ${err.message}`, 'ERROR');
        }
    }

    return createRichNotification({
        title,
        bodyLines,
        heroImagePath,
        iconName,
        onClick,
        silent,
        sound: resolveSound(soundKind),
        emergency,
        autoCloseMs: autoCloseMs === undefined ? DURATION_MS.standard : autoCloseMs,
        closeKey,
    });
}

function showAlertDetails({ language, title, typeName, locationName, level, levelKey, threatLines, startedAt, eventAt, durationMs, kyiv }) {
    const startedAtText = formatStartedAt(startedAt, language);
    const eventAtText = formatStartedAt(eventAt, language);
    const elapsed = durationMs !== undefined ? durationMs : startedAt ? Date.now() - new Date(startedAt).getTime() : null;
    const levelWord = levelShort(level, language).toLowerCase();
    const rows = [
        `${t('location', language)}: ${locationName}`,
        levelWord ? `${t(levelKey || 'alertCurrentLevel', language)}: ${levelWord}` : null,
        ...(threatLines || []),
        startedAtText ? `${t('alertStartedAt', language)}: ${startedAtText}` : null,
        Number.isFinite(elapsed) && elapsed >= 0 ? `${t('alertDuration', language)}: ${formatDuration(elapsed, language)}` : null,
        eventAtText ? `${t('alertNotifiedAt', language)}: ${eventAtText}` : null,
    ].filter(Boolean);

    return require('../windows/messageWindow')
        .showMessage({
            title,
            message: `${String(typeName).charAt(0).toUpperCase()}${String(typeName).slice(1)}`,
            buttons: [
                { id: 'map', label: t('detailsOpenMap', language) },
                { id: 'status', label: t('detailsOpenStatus', language) },
                { id: 'close', label: t('dialogClose', language), primary: true },
            ],
            cancelId: 'close',
            detail: rows.join('\n'),
        })
        .then((choice) => {
            if (choice === 'map') {
                const liveMap = require('../windows/liveMapWindow');
                if (kyiv) liveMap.openLiveMapWindowInKyivMode();
                else liveMap.openLiveMapWindow();
            } else if (choice === 'status') {
                require('../windows/hubWindow').showHub('status');
            }
        });
}

function levelLabel(level, language) {
    if (level === 'red') return t('alertLevelRed', language);
    if (level === 'yellow') return t('alertLevelYellow', language);
    return null;
}

function regionRow(name, level, parts, language) {
    const levelWord = levelShort(level, language).toLowerCase();
    const details = [levelWord, ...parts].filter(Boolean);
    return details.length ? `${name} - ${details.join(', ')}` : name;
}

function listClick(language, heading, items) {
    const eventAt = Date.now();
    return () => showRegionList(language, heading, items, eventAt);
}

function showRegionList(language, heading, items, eventAt) {
    const rows = items
        .slice()
        .sort((a, b) => levelRank(b.level) - levelRank(a.level) || String(a.name).localeCompare(String(b.name), language === 'English' ? 'en' : 'uk'))
        .map((item) => regionRow(item.name, item.level, item.parts || [], language));
    return require('../windows/messageWindow')
        .showMessage({
            title: t('appName', language),
            message: heading,
            detail: [eventAt ? `${t('alertNotifiedAt', language)}: ${formatStartedAt(eventAt, language)}\n` : null, ...rows].filter((line) => line !== null).join('\n'),
            buttons: [
                { id: 'status', label: t('detailsOpenStatus', language) },
                { id: 'close', label: t('dialogClose', language), primary: true },
            ],
            cancelId: 'close',
        })
        .then((choice) => {
            if (choice === 'status') require('../windows/hubWindow').showHub('status');
        });
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
        `${t('location', language)}: ${locationName}${level && !threatLines[0] ? ` (${level})` : ''}`,
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
    const label = levelShort(maxLevel, language).toLowerCase();
    return label ? `${t('alertMaxLevel', language)}: ${label}` : null;
}

function levelChangeLine(from, to, language) {
    return t('alertLevelChangeLine', language)
        .replace('{from}', levelShort(from, language).toLowerCase())
        .replace('{to}', levelShort(to, language).toLowerCase());
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
            onClick: listClick(
                    language,
                    t('massLevelChangeTitle', language).replace('{count}', events.length),
                    events.map((event) => ({
                        name: ctx.nameOf(event, language),
                        level: event.type === 'addThreat' ? event.entry.level : event.to,
                        parts: [event.type === 'addThreat' ? t('alertThreatAddedTitle', language).toLowerCase() : levelChangeLine(event.from, event.to, language)],
                    }))
                ),
            bodyLines: lines,
            iconName: iconForLevel(worst),
            color: levelColor(worst),
            soundKind: events.some((event) => event.type === 'escalate') ? 'up' : events.some((event) => event.type === 'deescalate') ? 'down' : null,
            ...effects(worst === 'red' && events.some((event) => event.type === 'escalate') ? summaryProfile(worst) : profileOf('levelChange')),
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
                    label ? `${t('alertCurrentLevel', language)}: ${levelShort(level, language).toLowerCase()}` : null,
                    durationLine(event.entry.startedAt, language),
                ];
            }

            notifyWithMap({
                uid: ctx.uidOf(event),
                title,
                bodyLines: bodyLines.filter(Boolean),
                iconName: iconForLevel(level),
                color: levelColor(level),
                onClick: ctx.onClick ? ((eventAt) => () => ctx.onClick(event, title, language, eventAt))(Date.now()) : undefined,
                kind: 'level',
                meta: { name, level },
                critical: event.type === 'escalate' && level === 'red',
                soundKind: event.type === 'escalate' ? 'up' : event.type === 'deescalate' ? 'down' : null,
                ...effects(event.type === 'escalate' && level === 'red' ? profileOf('escalateRed') : profileOf('levelChange')),
                closeKey: ctx.keyOf ? ctx.keyOf(event) : undefined,
            });
        });
    }

    if (!ctx.canNotify) {
        if (events.some((event) => event.type === 'escalate')) playStandalone('up');
        else if (events.some((event) => event.type === 'deescalate')) playStandalone('down');
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

let latestMatchedByKey = new Map();

function hasKnownLevel(alert) {
    return alert.alert_level === 'red' || alert.alert_level === 'yellow';
}

function startNotificationOptions(alert, language, alertCount) {
    const typeName = alertTypeName(alert.alert_type, language);
    const locationName = language === 'English' ? alert.location_lat : alert.location_title;
    const title = `${t('alertAttention', language)}: ${String(typeName).toLowerCase()}`;
    return {
        uid: alert.location_uid,
        title,
        bodyLines: startBodyLines(alert, locationName, alertCount, formatStartedAt(alert.started_at, language), language),
        iconName: iconForLevel(alert.alert_level),
        color: levelColor(alert.alert_level),
        onClick: (() => {
            const eventAt = Date.now();
            const threatText = describeThreats(alert.threats, language);
            return () =>
                showAlertDetails({
                    language,
                    title,
                    typeName,
                    locationName,
                    level: alert.alert_level,
                    threatLines: threatText ? threatText.split('\n') : [],
                    startedAt: alert.started_at,
                    eventAt,
                });
        })(),
        kind: 'start',
        meta: { name: locationName, level: alert.alert_level, typeName: String(typeName).toLowerCase() },
        critical: alert.alert_level === 'red',
        soundKind: 'start',
        ...effects(startProfile(alert.alert_level)),
        closeKey: alertKey(alert),
    };
}

function showStartWhenLevelKnown(alert, language, alertCount) {
    const key = alertKey(alert);
    const waitingSince = Date.now();
    const timer = setInterval(() => {
        const current = latestMatchedByKey.get(key);
        if (!current) {
            clearInterval(timer);
            return;
        }
        if (!hasKnownLevel(current) && Date.now() - waitingSince < LEVEL_GRACE_MS) return;
        clearInterval(timer);
        notifyWithMap(startNotificationOptions(current, language, alertCount));
    }, LEVEL_GRACE_POLL_MS);
    if (typeof timer.unref === 'function') timer.unref();
}

function alertThreatLines(event, onlyAdded, language) {
    const threats = (event.item.raw.threats || []).filter((threat) => !onlyAdded || event.added.includes(threatKey(threat)));
    const text = describeThreats(threats, language);
    return text ? text.split('\n') : [];
}

function processAlerts(matchedAlerts, allAlerts) {
    ensureDisplayedAlertsLoaded();
    latestMatchedByKey = new Map(matchedAlerts.map((alert) => [alertKey(alert), alert]));
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
    if (matchedAlerts.length || events.some((event) => !event.stale)) lastAlertActivityAt = Date.now();
    persistSnapshot(displayedAlerts, displayedAlertsJson, 'alert_displayed.json', 'id');
    scheduleRecheck(alertsRecheck, nextCheckInMs, () => processAlerts(...alertsRecheck.args));

    const startEvents = events.filter((event) => event.type === 'start');
    const levelEvents = events.filter((event) => ['escalate', 'deescalate', 'addThreat'].includes(event.type));
    const endEvents = events.filter((event) => event.type === 'end');

    const freshStarts = startEvents.filter((event) => !event.stale);
    const massStart = freshStarts.length > MASS_ALERT_THRESHOLD;

    if (massStart && canNotify) {
        const worst = worstLevelAmong(freshStarts.map((event) => event.item.raw));
        notifyWithMap({
            uids: freshStarts.map((event) => event.item.raw.location_uid),
            title: t('massAlertStartTitle', language).replace('{count}', freshStarts.length),
            onClick: listClick(
                    language,
                    t('massAlertStartTitle', language).replace('{count}', freshStarts.length),
                    freshStarts.map((event) => {
                        const alert = event.item.raw;
                        return {
                            name: language === 'English' ? alert.location_lat : alert.location_title,
                            level: alert.alert_level,
                            parts: [String(alertTypeName(alert.alert_type, language)).toLowerCase()],
                        };
                    })
                ),
            bodyLines: [`${t('activeInMonitored', language)}: ${alertCount}`],
            iconName: iconForLevel(worst),
            color: levelColor(worst),
            soundKind: 'start',
            ...effects(summaryProfile(worst)),
        });
    }

    startEvents.forEach((event) => {
        const alert = event.item.raw;
        const stale = event.stale;

        if (!stale && !massStart && canNotify) {
            if (alert.alert_type === 'air_raid' && !hasKnownLevel(alert)) showStartWhenLevelKnown(alert, language, alertCount);
            else notifyWithMap(startNotificationOptions(alert, language, alertCount));
        }

        const levelSuffix = alert.alert_level ? ` [${alert.alert_level}]` : '';
        logEvent(`Alert ${alert.alert_type}${levelSuffix}: ${alert.location_lat || alert.location_title}${stale ? ' (already active before this check)' : ''}`, 'ALERT');
    });

    if (!canNotify && freshStarts.length) playStandalone('start');

    notifyLevelChanges(levelEvents, {
        settings,
        language,
        canNotify,
        logLabel: 'Alert',
        uidOf: (event) => event.entry.locationUid,
        keyOf: (event) => event.id,
        uidsOf: (list) => list.map((event) => event.entry.locationUid),
        nameOf: (event, lang) => (lang === 'English' ? event.entry.locationLat : event.entry.locationTitle),
        logName: (event) => event.entry.locationLat || event.entry.locationTitle,
        threatLines: alertThreatLines,
        onClick: (event, title, lang, eventAt) => {
            const typeName = alertTypeName(event.entry.alertType, lang);
            const locationName = lang === 'English' ? event.entry.locationLat : event.entry.locationTitle;
            showAlertDetails({
                language: lang,
                title,
                typeName,
                locationName,
                level: event.to || event.entry.level,
                threatLines: alertThreatLines(event, false, lang),
                startedAt: event.entry.startedAt,
                eventAt,
            });
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
            onClick: listClick(
                    language,
                    t('massAlertCancelTitle', language).replace('{count}', newlyCancelled.length),
                    newlyCancelled.map((value) => ({
                        name: language === 'English' ? value.locationLat : value.locationTitle,
                        level: null,
                        parts: [String(alertTypeName(value.alertType, language)).toLowerCase()],
                    }))
                ),
            bodyLines: describeDurationRange(newlyCancelled, language),
            iconName: 'cancel.png',
            color: CANCEL_COLOR,
            soundKind: 'end',
            ...effects(profileOf('end')),
        });
    }

    endEvents.forEach((event) => closeToastsFor(event.id));

    newlyCancelled.forEach((value) => {
        const typeName = alertTypeName(value.alertType, language);
        const locationName = language === 'English' ? value.locationLat : value.locationTitle;
        const title = `${t('alertAllClear', language)}: ${String(typeName).toLowerCase()}`;
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
                onClick: ((eventAt) => () =>
                    showAlertDetails({
                        language,
                        title,
                        typeName,
                        locationName,
                        level: value.maxLevel,
                        levelKey: 'alertMaxLevel',
                        startedAt: value.startedAt,
                        eventAt,
                        durationMs: value.startedAt ? eventAt - new Date(value.startedAt).getTime() : null,
                    }))(Date.now()),
                kind: 'end',
                meta: { name: locationName, level: null },
                soundKind: 'end',
                ...effects(profileOf('end')),
            });
        }

        logEvent(`Alert cancelled: ${value.locationLat || value.locationTitle}`, 'ALERT');
    });

    if (!canNotify && newlyCancelled.length) playStandalone('end');
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
    if ((kyivRaions || []).length || events.some((event) => !event.stale)) lastAlertActivityAt = Date.now();
    persistSnapshot(displayedKyivDistricts, displayedKyivDistrictsJson, 'kyiv_district_displayed.json', 'name');
    scheduleRecheck(kyivRecheck, nextCheckInMs, () => processKyivDistricts(...kyivRecheck.args));

    const startEvents = events.filter((event) => event.type === 'start');
    const levelEvents = events.filter((event) => ['escalate', 'deescalate', 'addThreat'].includes(event.type));
    const endEvents = events.filter((event) => event.type === 'end');

    const freshStarts = startEvents.filter((event) => !event.stale);
    const massStart = freshStarts.length > MASS_ALERT_THRESHOLD;

    if (massStart && canNotify) {
        const worst = worstLevelAmong(freshStarts.map((event) => ({ alert_level: event.item.raw.alertLevel })));
        notifyWithMap({
            uid: KYIV_CITY_UID,
            title: t('massKyivDistrictAlertStartTitle', language).replace('{count}', freshStarts.length),
            onClick: listClick(
                    language,
                    t('massKyivDistrictAlertStartTitle', language).replace('{count}', freshStarts.length),
                    freshStarts.map((event) => ({ name: kyivDistrictDisplayName(event.item.raw.name, language), level: event.item.raw.alertLevel }))
                ),
            bodyLines: [],
            iconName: iconForLevel(worst),
            color: levelColor(worst),
            ...effects(summaryProfile(worst)),
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
                title: `${t('alertAttention', language)}: ${displayName}`,
                bodyLines: [
                    ...kyivDistrictThreatLines(district.threats, language),
                    startedAtText ? `${t('alertStartedAt', language)}: ${startedAtText}` : null,
                ].filter(Boolean),
                iconName: iconForLevel(district.alertLevel),
                color: levelColor(district.alertLevel),
                onClick: ((eventAt) => () =>
                    showAlertDetails({
                        language,
                        title: `${t('alertAttention', language)}: ${displayName}`,
                        typeName: alertTypeName('air_raid', language),
                        locationName: displayName,
                        level: district.alertLevel,
                        threatLines: kyivDistrictThreatLines(district.threats, language),
                        startedAt: district.startedAt,
                        eventAt,
                        kyiv: true,
                    }))(Date.now()),
                kind: 'start',
                meta: { name: displayName, level: district.alertLevel },
                critical: district.alertLevel === 'red',
                ...effects(startProfile(district.alertLevel)),
                closeKey: `kyiv:${district.name}`,
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
        keyOf: (event) => `kyiv:${event.id}`,
        uidsOf: () => [KYIV_CITY_UID],
        nameOf: (event, lang) => kyivDistrictDisplayName(event.entry.name, lang),
        logName: (event) => event.entry.name,
        threatLines: kyivThreatLines,
        onClick: (event, title, lang, eventAt) => {
            const displayName = kyivDistrictDisplayName(event.entry.name, lang);
            showAlertDetails({
                language: lang,
                title,
                typeName: alertTypeName('air_raid', lang),
                locationName: displayName,
                level: event.to || event.entry.level,
                threatLines: kyivThreatLines(event, false, lang),
                startedAt: event.entry.startedAt,
                eventAt,
                kyiv: true,
            });
        },
    });

    endEvents.forEach((event) => closeToastsFor(`kyiv:${event.id}`));

    const newlyEnded = skipCancellationNotice ? [] : endEvents.map((event) => ({ ...event.entry, name: event.id }));

    const massCancel = newlyEnded.length > MASS_ALERT_THRESHOLD;

    if (massCancel && canNotify) {
        notifyWithMap({
            uid: KYIV_CITY_UID,
            title: t('massKyivDistrictAlertCancelTitle', language).replace('{count}', newlyEnded.length),
            onClick: listClick(
                    language,
                    t('massKyivDistrictAlertCancelTitle', language).replace('{count}', newlyEnded.length),
                    newlyEnded.map((value) => ({ name: kyivDistrictDisplayName(value.name, language), level: null }))
                ),
            bodyLines: describeDurationRange(newlyEnded, language),
            iconName: 'cancel.png',
            color: CANCEL_COLOR,
            ...effects(profileOf('end')),
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
                title: `${t('alertAllClear', language)}: ${displayName}`,
                bodyLines: [
                    durationText ? `${t('alertDuration', language)}: ${durationText}` : null,
                    maxLevelLine(value.maxLevel, language),
                ].filter(Boolean),
                iconName: 'cancel.png',
                color: CANCEL_COLOR,
                onClick: ((eventAt) => () =>
                    showAlertDetails({
                        language,
                        title: `${t('alertAllClear', language)}: ${displayName}`,
                        typeName: alertTypeName('air_raid', language),
                        locationName: displayName,
                        level: value.maxLevel,
                        levelKey: 'alertMaxLevel',
                        startedAt: value.startedAt,
                        eventAt,
                        durationMs: value.startedAt ? eventAt - new Date(value.startedAt).getTime() : null,
                        kyiv: true,
                    }))(Date.now()),
                kind: 'end',
                meta: { name: displayName, level: null },
                ...effects(profileOf('end')),
            });
        }

        logEvent(`Kyiv district alert cancelled: ${value.name}`, 'ALERT');
    });
}

function getActiveCount() {
    ensureDisplayedAlertsLoaded();
    return displayedAlerts.size;
}

function existingIcon(fileName, fallbackName) {
    if (fs.existsSync(getResourcePath('icons', fileName))) return fileName;
    return fallbackName;
}

function notifyDataAvailability(state) {
    const settings = settingsStore.getSettings();
    if (!settings.visualNotificationsEnabled) return;
    const language = settings.language;

    if (state === 'nodata') {
        createNotification(t('noDataTitle', language), t('noDataBody', language), existingIcon('nodata.png', null), undefined, DURATION_MS.standard);
        return;
    }
    createNotification(t('dataRestoredTitle', language), t('dataRestoredBody', language), 'cancel.png', undefined, DURATION_MS.brief);
}

module.exports = { processAlerts, processKyivDistricts, getActiveCount, createNotification, notifyWithMap, notifyDataAvailability, configureThrottle, configureSound, configureToasts, isAlertActivityRecent };

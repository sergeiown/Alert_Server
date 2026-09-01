// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { Tray, Menu, app, Notification, nativeImage, nativeTheme, screen } = require('electron');
const { getResourcePath } = require('./appPaths');
const { openSettingsWindow } = require('../windows/settingsWindow');
const { openLiveMapWindow } = require('../windows/liveMapWindow');
const { openForecastWindow } = require('../windows/forecastWindow');
const { openTrendsWindow } = require('../windows/trendsWindow');
const { openLogWindow } = require('../windows/logWindow');
const { openAboutWindow } = require('../windows/aboutWindow');
const { toggleTrayPopup } = require('../windows/trayPopupWindow');
const settingsStore = require('./settingsStore');
const { logEvent } = require('./logger');
const { formatDuration } = require('./forecast');
const { getUpcomingPredictions } = require('./forecastWatcher');
const { t } = require('../../i18n/i18n');

const ICON_SIZES = [16, 20, 24, 28, 32, 40, 48, 64];
const PULSE_FRAME_COUNT = 12;
const PULSE_INTERVAL_MS = 55;
const SHAKE_FRAME_COUNT = 16;
const SHAKE_INTERVAL_MS = 90;

let trayInstance = null;
let lastActiveCount = 0;
let animationTimer = null;
let alertLoopActive = false;
let tooltipOverride = null;
let massAttackActive = false;
const menuIcons = new Map();
const iconCache = new Map();

function getMenuIcon(fileName) {
    if (!menuIcons.has(fileName)) {
        menuIcons.set(
            fileName,
            nativeImage.createFromPath(getResourcePath('icons', fileName)).resize({ width: 16, height: 16 })
        );
    }
    return menuIcons.get(fileName);
}

function getIconSize() {
    const scaleFactor = screen.getPrimaryDisplay().scaleFactor || 1;
    const target = Math.round(16 * scaleFactor);
    return ICON_SIZES.reduce((best, size) => (Math.abs(size - target) < Math.abs(best - target) ? size : best));
}

function loadIcon(fileName) {
    const size = getIconSize();
    const key = `${fileName}@${size}`;
    if (!iconCache.has(key)) {
        const image = nativeImage
            .createFromPath(getResourcePath('icons', fileName))
            .resize({ width: size, height: size, quality: 'best' });
        iconCache.set(key, image);
    }
    return iconCache.get(key);
}

function currentTheme() {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

// The mass-attack variant is a real dedicated icon (its own art, its own outline), not a color
// overlay on top of the normal one - so it's picked here, by filename, same as the alert/theme
// variants, rather than post-processed at render time.
function staticIconFile(activeCount, massAttack) {
    const alertPart = activeCount > 0 ? '_alert' : '';
    const massPart = massAttack ? '_mass' : '';
    return `tray${alertPart}${massPart}_${currentTheme()}.png`;
}

function pulseFrameFile(frameNumber, massAttack) {
    const massPart = massAttack ? 'mass_' : '';
    return `tray_${massPart}pulse_${frameNumber}_${currentTheme()}.png`;
}

function shakeFrameFile(frameNumber, massAttack) {
    const massPart = massAttack ? 'mass_' : '';
    return `tray_alert_${massPart}shake_${frameNumber}_${currentTheme()}.png`;
}

function stopAnimationTimer() {
    if (animationTimer) {
        clearInterval(animationTimer);
        animationTimer = null;
    }
}

function playFrames(fileNames, intervalMs, loop, onDone) {
    stopAnimationTimer();
    let index = 0;
    trayInstance.setImage(loadIcon(fileNames[0]));
    animationTimer = setInterval(() => {
        if (!trayInstance) return;
        index++;
        if (index >= fileNames.length) {
            if (!loop) {
                stopAnimationTimer();
                if (onDone) onDone();
                return;
            }
            index = 0;
        }
        trayInstance.setImage(loadIcon(fileNames[index]));
    }, intervalMs);
}

function playIdlePulse(massAttack) {
    const frames = Array.from({ length: PULSE_FRAME_COUNT }, (_, i) => pulseFrameFile(i + 1, massAttack));
    playFrames(frames, PULSE_INTERVAL_MS, false, () => {
        if (trayInstance) trayInstance.setImage(loadIcon(staticIconFile(0, massAttack)));
    });
}

function startAlertLoop(massAttack) {
    alertLoopActive = true;
    const frames = Array.from({ length: SHAKE_FRAME_COUNT }, (_, i) => shakeFrameFile(i + 1, massAttack));
    playFrames(frames, SHAKE_INTERVAL_MS, true);
}

function stopAlertLoop() {
    alertLoopActive = false;
    stopAnimationTimer();
}

function refreshIconForCurrentState() {
    if (!trayInstance) return;
    if (alertLoopActive) {
        startAlertLoop(massAttackActive);
    } else {
        stopAnimationTimer();
        trayInstance.setImage(loadIcon(staticIconFile(lastActiveCount, massAttackActive)));
    }
}

function buildMenu(language) {
    return Menu.buildFromTemplate([
        { label: t('appName', language), icon: getMenuIcon('app-icon-256.png'), click: () => openAboutWindow() },
        { type: 'separator' },
        { label: t('menuLiveMap', language), icon: getMenuIcon('Live_map.png'), click: () => openLiveMapWindow() },
        { label: t('menuForecast', language), icon: getMenuIcon('Forecast.png'), click: () => openForecastWindow() },
        { label: t('menuTrends', language), icon: getMenuIcon('Trends.png'), click: () => openTrendsWindow() },
        { label: t('menuSettings', language), icon: getMenuIcon('Settings.png'), click: () => openSettingsWindow() },
        { label: t('menuLog', language), icon: getMenuIcon('Event_log.png'), click: () => openLogWindow() },
        { type: 'separator' },
        {
            label: t('menuExit', language),
            icon: getMenuIcon('Exit.png'),
            click: () => {
                logEvent('Exit requested from tray menu', 'INFO');
                app.quit();
            },
        },
    ]);
}

function createTray() {
    const { language } = settingsStore.getSettings();

    trayInstance = new Tray(loadIcon(staticIconFile(0, false)));
    trayInstance.setToolTip(t('trayDefaultTooltip', language));
    trayInstance.setContextMenu(buildMenu(language));
    trayInstance.on('click', (event, bounds) => toggleTrayPopup(bounds));

    nativeTheme.on('updated', refreshIconForCurrentState);
    screen.on('display-metrics-changed', refreshIconForCurrentState);

    new Notification({
        title: t('notificationStartTitle', language),
        body: t('notificationStartBody', language),
    }).show();

    return trayInstance;
}

function setTemporaryTooltip(text) {
    tooltipOverride = text;
    if (trayInstance) trayInstance.setToolTip(text);
}

function clearTemporaryTooltip() {
    tooltipOverride = null;
}

// activeCount (monitored-region alerts) and totalCount (nationwide alerts, compared against
// massAttackThreshold for the badge) are deliberately independent: a quiet monitored region can
// still be badged during a nationwide mass attack, and vice versa.
function updateTrayState(activeCount, totalCount) {
    if (!trayInstance) return;

    const wasIdle = lastActiveCount === 0;
    lastActiveCount = activeCount;
    const { language, massAttackThreshold } = settingsStore.getSettings();
    const wasMassAttackActive = massAttackActive;
    massAttackActive = totalCount >= massAttackThreshold;
    const massAttackChanged = massAttackActive !== wasMassAttackActive;

    if (activeCount > 0) {
        // Also restarts the loop on a mass-attack change mid-alert, so the shake frames (and
        // their color pulse direction) switch to match immediately, not just on the next alert.
        if (!alertLoopActive || massAttackChanged) startAlertLoop(massAttackActive);
    } else if (alertLoopActive) {
        stopAlertLoop();
        trayInstance.setImage(loadIcon(staticIconFile(0, massAttackActive)));
    } else if (wasIdle && !animationTimer) {
        playIdlePulse(massAttackActive);
    } else if (massAttackChanged) {
        // Neither branch above touches the icon (no animation running, not freshly idle) - the
        // badge alone changed, so the static icon still needs a manual refresh to show/hide it.
        trayInstance.setImage(loadIcon(staticIconFile(activeCount, massAttackActive)));
    }

    if (tooltipOverride) return;

    const lines = [];
    if (activeCount > 0) {
        lines.push(`${t('trayActiveTooltip', language)}: ${activeCount}`);
    } else {
        const [upcoming] = getUpcomingPredictions(language, 1);
        if (upcoming) {
            const etaText = formatDuration(Math.max(0, upcoming.predictedAt - Date.now()), language);
            lines.push(`${t('forecastUpcoming', language)}: ${upcoming.name} ${t('forecastEtaLabel', language)} ${etaText}`);
        } else {
            lines.push(t('trayDefaultTooltip', language));
        }
    }
    if (massAttackActive) {
        lines.push(`${t('trayMassAttackTooltip', language)}: ${totalCount}`);
    }
    trayInstance.setToolTip(lines.join('\n'));
}

module.exports = { createTray, updateTrayState, setTemporaryTooltip, clearTemporaryTooltip };

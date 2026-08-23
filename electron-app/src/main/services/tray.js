// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { Tray, Menu, app, Notification, nativeImage, nativeTheme, screen } = require('electron');
const { getResourcePath } = require('./appPaths');
const { applyMassAttackBadge } = require('./trayBadge');
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

function loadIcon(fileName, badge = false) {
    const size = getIconSize();
    const key = badge ? `${fileName}@${size}#mass` : `${fileName}@${size}`;
    if (!iconCache.has(key)) {
        let image = nativeImage
            .createFromPath(getResourcePath('icons', fileName))
            .resize({ width: size, height: size, quality: 'best' });
        if (badge) image = applyMassAttackBadge(image);
        iconCache.set(key, image);
    }
    return iconCache.get(key);
}

function currentTheme() {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function staticIconFile(activeCount, trayMonoIcon) {
    const alertPart = activeCount > 0 ? '_alert' : '';
    const stylePart = trayMonoIcon ? '_mono' : '';
    return `tray${alertPart}${stylePart}_${currentTheme()}.png`;
}

function pulseFrameFile(frameNumber, trayMonoIcon) {
    return trayMonoIcon
        ? `tray_mono_pulse_${frameNumber}_${currentTheme()}.png`
        : `tray_pulse_${frameNumber}_${currentTheme()}.png`;
}

function shakeFrameFile(frameNumber, trayMonoIcon) {
    return trayMonoIcon
        ? `tray_alert_mono_shake_${frameNumber}_${currentTheme()}.png`
        : `tray_alert_shake_${frameNumber}_${currentTheme()}.png`;
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
    trayInstance.setImage(loadIcon(fileNames[0], massAttackActive));
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
        trayInstance.setImage(loadIcon(fileNames[index], massAttackActive));
    }, intervalMs);
}

function playIdlePulse(trayMonoIcon) {
    const frames = Array.from({ length: PULSE_FRAME_COUNT }, (_, i) => pulseFrameFile(i + 1, trayMonoIcon));
    playFrames(frames, PULSE_INTERVAL_MS, false, () => {
        if (trayInstance) trayInstance.setImage(loadIcon(staticIconFile(0, trayMonoIcon), massAttackActive));
    });
}

function startAlertLoop(trayMonoIcon) {
    alertLoopActive = true;
    const frames = Array.from({ length: SHAKE_FRAME_COUNT }, (_, i) => shakeFrameFile(i + 1, trayMonoIcon));
    playFrames(frames, SHAKE_INTERVAL_MS, true);
}

function stopAlertLoop() {
    alertLoopActive = false;
    stopAnimationTimer();
}

function refreshIconForCurrentState() {
    if (!trayInstance) return;
    const { trayMonoIcon } = settingsStore.getSettings();
    if (alertLoopActive) {
        startAlertLoop(trayMonoIcon);
    } else {
        stopAnimationTimer();
        trayInstance.setImage(loadIcon(staticIconFile(lastActiveCount, trayMonoIcon), massAttackActive));
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
                logEvent('Exit requested from tray menu');
                app.quit();
            },
        },
    ]);
}

function createTray() {
    const { language, trayMonoIcon } = settingsStore.getSettings();

    trayInstance = new Tray(loadIcon(staticIconFile(0, trayMonoIcon)));
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
    const { language, trayMonoIcon, massAttackThreshold } = settingsStore.getSettings();
    const wasMassAttackActive = massAttackActive;
    massAttackActive = totalCount >= massAttackThreshold;

    if (activeCount > 0) {
        if (!alertLoopActive) startAlertLoop(trayMonoIcon);
    } else if (alertLoopActive) {
        stopAlertLoop();
        trayInstance.setImage(loadIcon(staticIconFile(0, trayMonoIcon), massAttackActive));
    } else if (wasIdle && !animationTimer) {
        playIdlePulse(trayMonoIcon);
    } else if (massAttackActive !== wasMassAttackActive) {
        // Neither branch above touches the icon (no animation running, not freshly idle) - the
        // badge alone changed, so the static icon still needs a manual refresh to show/hide it.
        trayInstance.setImage(loadIcon(staticIconFile(activeCount, trayMonoIcon), massAttackActive));
    }

    if (tooltipOverride) return;

    const lines = [];
    if (activeCount > 0) {
        lines.push(`${t('trayActiveTooltip', language)}: ${activeCount}`);
    } else {
        const [upcoming] = getUpcomingPredictions(language, 1);
        if (upcoming) {
            const etaText = formatDuration(Math.max(0, upcoming.predictedAt - Date.now()), language);
            lines.push(`${t('forecastUpcoming', language)}: ${upcoming.name} ~${etaText}`);
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

const { Tray, Menu, app, Notification, nativeImage, nativeTheme, screen } = require('electron');
const { getResourcePath } = require('./appPaths');
const { openSettingsWindow } = require('../windows/settingsWindow');
const { openMapWindow } = require('../windows/mapWindow');
const { openForecastWindow } = require('../windows/forecastWindow');
const { openLogWindow } = require('../windows/logWindow');
const { openAboutWindow } = require('../windows/aboutWindow');
const { toggleTrayPopup } = require('../windows/trayPopupWindow');
const settingsStore = require('./settingsStore');
const { logEvent } = require('./logger');
const { formatDuration } = require('./forecast');
const { getUpcomingPredictions } = require('./forecastWatcher');
const { t } = require('../../i18n/i18n');

const ALERTS_MAP_URL = 'https://alerts.in.ua/';
const FRONT_MAP_URL = 'https://deepstatemap.live/';

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
        iconCache.set(
            key,
            nativeImage.createFromPath(getResourcePath('icons', fileName)).resize({ width: size, height: size, quality: 'best' })
        );
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

function playIdlePulse(trayMonoIcon) {
    const frames = Array.from({ length: PULSE_FRAME_COUNT }, (_, i) => pulseFrameFile(i + 1, trayMonoIcon));
    playFrames(frames, PULSE_INTERVAL_MS, false, () => {
        if (trayInstance) trayInstance.setImage(loadIcon(staticIconFile(0, trayMonoIcon)));
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
        trayInstance.setImage(loadIcon(staticIconFile(lastActiveCount, trayMonoIcon)));
    }
}

function buildMenu(language) {
    return Menu.buildFromTemplate([
        { label: t('appName', language), icon: getMenuIcon('app-icon-256.png'), click: () => openAboutWindow() },
        { type: 'separator' },
        {
            label: t('menuMapAlerts', language),
            icon: getMenuIcon('Alert_map.png'),
            click: () => openMapWindow(ALERTS_MAP_URL, t('menuMapAlerts', language)),
        },
        {
            label: t('menuMapFront', language),
            icon: getMenuIcon('Front_line_map.png'),
            click: () => openMapWindow(FRONT_MAP_URL, t('menuMapFront', language)),
        },
        { label: t('menuForecast', language), icon: getMenuIcon('Forecast.png'), click: () => openForecastWindow() },
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

function updateTrayState(activeCount) {
    if (!trayInstance) return;

    const wasIdle = lastActiveCount === 0;
    lastActiveCount = activeCount;
    const { language, trayMonoIcon } = settingsStore.getSettings();

    if (activeCount > 0) {
        if (!alertLoopActive) startAlertLoop(trayMonoIcon);
    } else if (alertLoopActive) {
        stopAlertLoop();
        trayInstance.setImage(loadIcon(staticIconFile(0, trayMonoIcon)));
    } else if (wasIdle && !animationTimer) {
        playIdlePulse(trayMonoIcon);
    }

    if (tooltipOverride) return;

    if (activeCount > 0) {
        trayInstance.setToolTip(`${t('trayActiveTooltip', language)}: ${activeCount}`);
        return;
    }

    const [upcoming] = getUpcomingPredictions(language, 1);
    if (upcoming) {
        const etaText = formatDuration(Math.max(0, upcoming.predictedAt - Date.now()), language);
        trayInstance.setToolTip(`${t('forecastUpcoming', language)}: ${upcoming.name} ~${etaText}`);
        return;
    }

    trayInstance.setToolTip(t('trayDefaultTooltip', language));
}

module.exports = { createTray, updateTrayState, setTemporaryTooltip, clearTemporaryTooltip };

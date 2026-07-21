const { Tray, Menu, shell, dialog, app, Notification, nativeImage } = require('electron');
const { getResourcePath, getUserDataFile } = require('./appPaths');
const { openSettingsWindow } = require('../windows/settingsWindow');
const { openMapWindow } = require('../windows/mapWindow');
const { openForecastWindow } = require('../windows/forecastWindow');
const { toggleTrayPopup } = require('../windows/trayPopupWindow');
const settingsStore = require('./settingsStore');
const { logEvent } = require('./logger');
const { formatDuration } = require('./forecast');
const { getUpcomingPredictions } = require('./forecastWatcher');
const { t } = require('../../i18n/i18n');

const ALERTS_MAP_URL = 'https://alerts.in.ua/';
const FRONT_MAP_URL = 'https://deepstatemap.live/';

let trayInstance = null;
let menuIcon = null;

function getMenuIcon() {
    if (!menuIcon) {
        menuIcon = nativeImage
            .createFromPath(getResourcePath('icons', 'app-icon-256.png'))
            .resize({ width: 16, height: 16 });
    }
    return menuIcon;
}

function iconPath(activeCount, trayMonoIcon) {
    const name =
        activeCount > 0
            ? trayMonoIcon
                ? 'tray_alert_mono.ico'
                : 'tray_alert.ico'
            : trayMonoIcon
              ? 'tray_mono.ico'
              : 'tray.ico';
    return getResourcePath('icons', name);
}

function buildMenu(language) {
    return Menu.buildFromTemplate([
        { label: t('appName', language), icon: getMenuIcon(), enabled: false },
        { type: 'separator' },
        { label: t('menuMapAlerts', language), click: () => openMapWindow(ALERTS_MAP_URL, t('menuMapAlerts', language)) },
        { label: t('menuMapFront', language), click: () => openMapWindow(FRONT_MAP_URL, t('menuMapFront', language)) },
        { label: t('menuForecast', language), click: () => openForecastWindow() },
        { label: t('menuSettings', language), click: () => openSettingsWindow() },
        {
            label: t('menuInfo', language),
            submenu: [
                { label: t('menuLog', language), click: () => shell.openPath(getUserDataFile('event.log')) },
                {
                    label: t('menuAbout', language),
                    click: () =>
                        dialog.showMessageBox({
                            type: 'info',
                            title: t('appName', language),
                            message: `${t('appName', language)} v${app.getVersion()}`,
                            detail: [
                                t('aboutBody', language),
                                '',
                                t('aboutLicense', language),
                                t('aboutCopyright', language),
                            ].join('\n'),
                        }),
                },
            ],
        },
        { type: 'separator' },
        {
            label: t('menuExit', language),
            click: () => {
                logEvent('Exit requested from tray menu');
                app.quit();
            },
        },
    ]);
}

function createTray() {
    const { language, trayMonoIcon } = settingsStore.getSettings();

    trayInstance = new Tray(iconPath(0, trayMonoIcon));
    trayInstance.setToolTip(t('trayDefaultTooltip', language));
    trayInstance.setContextMenu(buildMenu(language));
    trayInstance.on('click', (event, bounds) => toggleTrayPopup(bounds));

    new Notification({
        title: t('notificationStartTitle', language),
        body: t('notificationStartBody', language),
    }).show();

    return trayInstance;
}

function updateTrayState(activeCount) {
    if (!trayInstance) return;

    const { language, trayMonoIcon } = settingsStore.getSettings();
    trayInstance.setImage(iconPath(activeCount, trayMonoIcon));

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

module.exports = { createTray, updateTrayState };

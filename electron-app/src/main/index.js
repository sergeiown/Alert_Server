// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { app, nativeTheme } = require('electron');
const { registerSettingsIpc } = require('./ipc/settingsIpc');
const { registerRegionsIpc } = require('./ipc/regionsIpc');
const { registerSystemIpc } = require('./ipc/systemIpc');
const { registerForecastIpc } = require('./ipc/forecastIpc');
const { registerTrayPopupIpc } = require('./ipc/trayPopupIpc');
const { registerLogIpc } = require('./ipc/logIpc');
const { registerLiveMapIpc } = require('./ipc/liveMapIpc');
const { registerTrendsIpc } = require('./ipc/trendsIpc');
const { importLegacyConfig } = require('./migration/importLegacyConfig');
const settingsStore = require('./services/settingsStore');
const regionsStore = require('./services/regionsStore');
const { logEvent } = require('./services/logger');
const { startPolling } = require('./services/alertPoller');
const { startPolling: startNeptunPolling } = require('./services/neptunAlertsSource');
const { filterAlerts, discoverUnknownLocations } = require('./services/locationFilter');
const { loadLocalConfig } = require('./services/localConfig');
const { processAlerts, getActiveCount } = require('./services/notifier');
const { setLatestMatchedAlerts, setLatestTotalAlertCount, setLatestAlertedRegions } = require('./services/alertState');
const { computeAlertedRegions } = require('./services/regionAlertStatus');
const { recordAlerts } = require('./services/dailyAlertStats');
const { createTray, updateTrayState } = require('./services/tray');
const { startForecastWatcher } = require('./services/forecastWatcher');
const { startOccupiedTerritoryRefresh } = require('./services/occupiedTerritoryStore');
const { startWeaponStatsRefresh } = require('./services/weaponStatsStore');
const { installHandlers } = require('./services/crashRestart');
const { delayedCheckForUpdates } = require('./services/updater');
const { destroySettingsWindow } = require('./windows/settingsWindow');

const LEGACY_APP_DIR = 'd:\\Projects\\Current_Alert';

if (!app.requestSingleInstanceLock()) {
    app.exit(0);
}

app.setAppUserModelId('com.sergeiown.alertserver');

app.whenReady().then(() => {
    installHandlers();
    logEvent(`Application started (v${app.getVersion()})`, 'INFO');

    const result = importLegacyConfig(LEGACY_APP_DIR, { settingsStore, regionsStore });
    logEvent(`Legacy config import: ${JSON.stringify(result)}`, 'INFO');

    nativeTheme.themeSource = settingsStore.getSettings().theme;

    registerSettingsIpc();
    registerRegionsIpc();
    registerSystemIpc();
    registerForecastIpc();
    registerTrayPopupIpc();
    registerLogIpc();
    registerLiveMapIpc();
    registerTrendsIpc();

    createTray();
    delayedCheckForUpdates();
    startOccupiedTerritoryRefresh();
    startWeaponStatsRefresh();

    const { alertSourceProvider } = settingsStore.getSettings();
    let forecastWatcherStarted = false;

    function onAlertsPolled(sourceLabel, alertData) {
        const matched = filterAlerts(alertData);
        discoverUnknownLocations(alertData.alerts);
        logEvent(`Poll (${sourceLabel}): ${alertData.alerts.length} active alerts, ${matched.length} in monitored regions`, 'NETWORK');
        setLatestMatchedAlerts(matched);
        setLatestTotalAlertCount(alertData.alerts.length);
        setLatestAlertedRegions(computeAlertedRegions(alertData.alerts));
        recordAlerts(alertData.alerts);
        processAlerts(matched, alertData.alerts);
        updateTrayState(getActiveCount(), alertData.alerts.length);

        if (!forecastWatcherStarted) {
            forecastWatcherStarted = true;
            startForecastWatcher();
        }
    }

    if (alertSourceProvider === 'neptun') {
        startNeptunPolling((alertData) => onAlertsPolled('Neptun', alertData));
    } else {
        const { alertProxyClientKey } = loadLocalConfig();
        if (alertProxyClientKey) {
            startPolling(alertProxyClientKey, (alertData) => onAlertsPolled('alerts.in.ua via alert-proxy', alertData));
        } else {
            logEvent('alertProxyClientKey missing from config.local.json, polling disabled', 'WARNING');
            startForecastWatcher();
        }
    }
});

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
    destroySettingsWindow();
});

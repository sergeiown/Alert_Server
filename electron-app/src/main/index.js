const { app } = require('electron');
const { registerSettingsIpc } = require('./ipc/settingsIpc');
const { registerRegionsIpc } = require('./ipc/regionsIpc');
const { registerSystemIpc } = require('./ipc/systemIpc');
const { registerForecastIpc } = require('./ipc/forecastIpc');
const { registerTrayPopupIpc } = require('./ipc/trayPopupIpc');
const { registerLogIpc } = require('./ipc/logIpc');
const { importLegacyConfig } = require('./migration/importLegacyConfig');
const settingsStore = require('./services/settingsStore');
const regionsStore = require('./services/regionsStore');
const { logEvent } = require('./services/logger');
const { startPolling } = require('./services/alertPoller');
const { filterAlerts, discoverUnknownLocations } = require('./services/locationFilter');
const { loadLocalConfig } = require('./services/localConfig');
const { processAlerts, getActiveCount } = require('./services/notifier');
const { setLatestMatchedAlerts } = require('./services/alertState');
const { createTray, updateTrayState } = require('./services/tray');
const { startForecastWatcher } = require('./services/forecastWatcher');
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
    logEvent(`Application started (v${app.getVersion()})`);

    const result = importLegacyConfig(LEGACY_APP_DIR, { settingsStore, regionsStore });
    logEvent(`Legacy config import: ${JSON.stringify(result)}`);

    registerSettingsIpc();
    registerRegionsIpc();
    registerSystemIpc();
    registerForecastIpc();
    registerTrayPopupIpc();
    registerLogIpc();

    createTray();
    delayedCheckForUpdates();

    const { alertProxyClientKey } = loadLocalConfig();
    if (alertProxyClientKey) {
        let forecastWatcherStarted = false;

        startPolling(alertProxyClientKey, (alertData) => {
            const matched = filterAlerts(alertData);
            discoverUnknownLocations(alertData.alerts);
            logEvent(`Poll: ${alertData.alerts.length} active alerts, ${matched.length} in monitored regions`);
            setLatestMatchedAlerts(matched);
            processAlerts(matched, alertData.alerts);
            updateTrayState(getActiveCount());

            if (!forecastWatcherStarted) {
                forecastWatcherStarted = true;
                startForecastWatcher();
            }
        });
    } else {
        logEvent('alertProxyClientKey missing from config.local.json, polling disabled');
        startForecastWatcher();
    }
});

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
    destroySettingsWindow();
});

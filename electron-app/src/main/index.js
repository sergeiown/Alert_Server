const { app } = require('electron');
const { registerSettingsIpc } = require('./ipc/settingsIpc');
const { registerRegionsIpc } = require('./ipc/regionsIpc');
const { openSettingsWindow } = require('./windows/settingsWindow');
const { importLegacyConfig } = require('./migration/importLegacyConfig');
const settingsStore = require('./services/settingsStore');
const regionsStore = require('./services/regionsStore');
const { logEvent } = require('./services/logger');
const { startPolling } = require('./services/alertPoller');
const { filterAlerts } = require('./services/locationFilter');
const { loadLocalConfig } = require('./services/localConfig');
const { processAlerts } = require('./services/notifier');

const LEGACY_APP_DIR = 'd:\\Projects\\Current_Alert';

app.setAppUserModelId('com.sergeiown.alertserver');

app.whenReady().then(() => {
    const result = importLegacyConfig(LEGACY_APP_DIR, { settingsStore, regionsStore });
    logEvent(`Legacy config import: ${JSON.stringify(result)}`);

    registerSettingsIpc();
    registerRegionsIpc();

    openSettingsWindow();

    const { alertProxyClientKey } = loadLocalConfig();
    if (alertProxyClientKey) {
        startPolling(alertProxyClientKey, (alertData) => {
            const matched = filterAlerts(alertData);
            logEvent(`Poll: ${alertData.alerts.length} active alerts, ${matched.length} in monitored regions`);
            processAlerts(matched);
        });
    } else {
        logEvent('alertProxyClientKey missing from config.local.json, polling disabled');
    }
});

app.on('window-all-closed', () => {});

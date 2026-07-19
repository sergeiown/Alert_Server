const { app } = require('electron');
const { registerSettingsIpc } = require('./ipc/settingsIpc');
const { registerRegionsIpc } = require('./ipc/regionsIpc');
const { openSettingsWindow } = require('./windows/settingsWindow');
const { importLegacyConfig } = require('./migration/importLegacyConfig');
const settingsStore = require('./services/settingsStore');
const regionsStore = require('./services/regionsStore');
const { logEvent } = require('./services/logger');

const LEGACY_APP_DIR = 'd:\\Projects\\Current_Alert';

app.whenReady().then(() => {
    const result = importLegacyConfig(LEGACY_APP_DIR, { settingsStore, regionsStore });
    logEvent(`Legacy config import: ${JSON.stringify(result)}`);

    registerSettingsIpc();
    registerRegionsIpc();

    openSettingsWindow();
});

app.on('window-all-closed', () => {});

const { ipcMain } = require('electron');
const settingsStore = require('../services/settingsStore');

function registerSettingsIpc() {
    ipcMain.handle('settings:get', () => settingsStore.getSettings());
    ipcMain.handle('settings:set', (event, key, value) => {
        settingsStore.updateSetting(key, value);
        return settingsStore.getSettings();
    });
}

module.exports = { registerSettingsIpc };

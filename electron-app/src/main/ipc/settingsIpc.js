const { ipcMain, app } = require('electron');
const settingsStore = require('../services/settingsStore');
const { getDictionary } = require('../../i18n/i18n');

function registerSettingsIpc() {
    ipcMain.handle('settings:get', () => settingsStore.getSettings());
    ipcMain.handle('i18n:getStrings', () => getDictionary(settingsStore.getSettings().language));
    ipcMain.handle('settings:set', (event, key, value) => {
        settingsStore.updateSetting(key, value);

        if (key === 'language') {
            setTimeout(() => {
                app.relaunch();
                app.exit();
            }, 200);
        }

        return settingsStore.getSettings();
    });
}

module.exports = { registerSettingsIpc };

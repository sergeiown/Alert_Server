const { ipcMain, app } = require('electron');
const settingsStore = require('../services/settingsStore');

function registerSettingsIpc() {
    ipcMain.handle('settings:get', () => settingsStore.getSettings());
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

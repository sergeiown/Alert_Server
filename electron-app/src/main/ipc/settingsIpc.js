const { ipcMain, app, nativeTheme } = require('electron');
const settingsStore = require('../services/settingsStore');
const { getDictionary } = require('../../i18n/i18n');
const { logEvent } = require('../services/logger');

function registerSettingsIpc() {
    ipcMain.handle('settings:get', () => settingsStore.getSettings());
    ipcMain.handle('i18n:getStrings', () => getDictionary(settingsStore.getSettings().language));
    ipcMain.handle('settings:set', (event, key, value) => {
        settingsStore.updateSetting(key, value);
        logEvent(`Setting changed: ${key} = ${value}`);

        if (key === 'language') {
            setTimeout(() => {
                app.relaunch();
                app.exit();
            }, 200);
        }

        if (key === 'theme') {
            // Electron's own theme source drives every renderer's "prefers-color-scheme" media
            // query at once - no per-window plumbing needed, every window's existing dark-mode
            // CSS already responds to this.
            nativeTheme.themeSource = value;
        }

        return settingsStore.getSettings();
    });
}

module.exports = { registerSettingsIpc };

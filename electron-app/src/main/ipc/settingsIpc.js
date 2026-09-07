// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain, app, nativeTheme } = require('electron');
const settingsStore = require('../services/settingsStore');
const { getDictionary } = require('../../i18n/i18n');
const { logEvent } = require('../services/logger');
const { getLiveMapWindow } = require('../windows/liveMapWindow');

function registerSettingsIpc() {
    ipcMain.handle('settings:get', () => settingsStore.getSettings());
    ipcMain.handle('i18n:getStrings', () => getDictionary(settingsStore.getSettings().language));
    ipcMain.handle('settings:set', (event, key, value) => {
        settingsStore.updateSetting(key, value);
        logEvent(`Setting changed: ${key} = ${value}`, 'INFO');

        if (key === 'alertSourceProvider') {

            logEvent(`Alert data source switched to ${value}, relaunching to apply it`, 'INFO');
        }

        if (key === 'language' || key === 'alertSourceProvider') {

            setTimeout(() => {
                app.relaunch();
                app.exit();
            }, 200);
        }

        if (key === 'theme') {
            nativeTheme.themeSource = value;

            const liveMapWindow = getLiveMapWindow();
            if (liveMapWindow) liveMapWindow.webContents.reload();
        }

        return settingsStore.getSettings();
    });
}

module.exports = { registerSettingsIpc };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain, app, nativeTheme } = require('electron');
const settingsStore = require('../services/settingsStore');
const { getDictionary } = require('../../i18n/i18n');
const { logEvent } = require('../services/logger');
const { getLiveMapWindow } = require('../windows/liveMapWindow');
const { soundFor, playFor } = require('../services/audioPlayer');

function registerSettingsIpc() {
    ipcMain.handle('settings:get', () => settingsStore.getSettings());
    ipcMain.handle('i18n:getStrings', () => getDictionary(settingsStore.getSettings().language));
    ipcMain.handle('settings:set', (event, key, value) => {
        settingsStore.updateSetting(key, value);
        logEvent(`Setting changed: ${key} = ${value && typeof value === 'object' ? JSON.stringify(value) : value}`, 'INFO');

        if (key === 'language') {

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
    ipcMain.handle('sound:test', () => {
        const settings = settingsStore.getSettings();
        const mode = settings.alertSoundMode === 'none' ? 'siren' : settings.alertSoundMode;
        const spec = soundFor('start', mode, settings.language, 1, settings.alertSoundVolume);
        if (spec) playFor('settings-test', spec);
    });
}

module.exports = { registerSettingsIpc };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain, app, nativeTheme } = require('electron');
const settingsStore = require('../services/settingsStore');
const { getDictionary } = require('../../i18n/i18n');
const { logEvent } = require('../services/logger');
const { getLiveMapWindow } = require('../windows/liveMapWindow');
const { soundFor, playFor, stopFor, isPlayingFor } = require('../services/audioPlayer');

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
    ipcMain.handle('sound:test', (event) => {
        if (isPlayingFor('settings-test')) {
            stopFor('settings-test');
            return false;
        }
        const settings = settingsStore.getSettings();
        if (settings.alertSoundMode === 'none') return false;
        const spec = soundFor('start', settings.alertSoundMode, settings.language, settings.alertSoundCount, settings.alertSoundVolume, settings.duckOtherSounds);
        if (!spec) return false;
        const sender = event.sender;
        playFor('settings-test', spec, () => {
            if (!sender.isDestroyed()) sender.send('sound:testEnded');
        });
        return true;
    });
}

module.exports = { registerSettingsIpc };

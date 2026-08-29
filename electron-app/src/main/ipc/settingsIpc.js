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

        if (key === 'language') {
            setTimeout(() => {
                app.relaunch();
                app.exit();
            }, 200);
        }

        if (key === 'theme') {
            nativeTheme.themeSource = value;

            // Plain CSS (media queries) repaints itself automatically once themeSource changes -
            // no per-window plumbing needed there. The live map's own layers are a different
            // story: several of them (region status, rivers, city labels, occupied territory)
            // read matchMedia('(prefers-color-scheme: dark)') once when built and bake that into
            // colors passed straight to Leaflet, so they'd otherwise keep the old theme's colors
            // until the window was closed and reopened. A full reload re-evaluates everything
            // from scratch, which is simpler and more reliable than reactively re-styling each
            // one of those layers in place.
            const liveMapWindow = getLiveMapWindow();
            if (liveMapWindow) liveMapWindow.webContents.reload();
        }

        return settingsStore.getSettings();
    });
}

module.exports = { registerSettingsIpc };

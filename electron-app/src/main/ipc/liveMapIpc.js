// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain, clipboard, BrowserWindow, systemPreferences } = require('electron');
const { getResourcePath } = require('../services/appPaths');
const { getLatestTotalAlertCount, getLatestAlertedRegions, getActiveAlertSource } = require('../services/alertState');
const { getLatestOccupiedTerritory } = require('../services/occupiedTerritoryStore');
const { alertTypeName } = require('../services/alertTypes');
const { getTitleBarAccentColor } = require('../services/accentColor');
const { getLiveMapWindow, consumePendingKyivMode } = require('../windows/liveMapWindow');
const settingsStore = require('../services/settingsStore');
const { logEvent } = require('../services/logger');

function withAlertTypeName(entries, language) {
    return entries.map((entry) => ({
        ...entry,
        alertTypeName: entry.alertType ? alertTypeName(entry.alertType, language) : null,
        threats: (entry.threats || []).map((threat) => ({
            level: threat.level,
            description: threat.alertType ? alertTypeName(threat.alertType, language) : null,
        })),
    }));
}

function registerLiveMapIpc() {
    ipcMain.handle('liveMap:getBaseMapUrl', () => {
        const filePath = getResourcePath('icons', 'ukraine_live_map.svg').replace(/\\/g, '/');
        return `file://${filePath}`;
    });

    ipcMain.handle('liveMap:getActiveAlertCount', () => getLatestTotalAlertCount());

    ipcMain.handle('liveMap:getActiveAlertSource', () => getActiveAlertSource());

    ipcMain.handle('liveMap:getAlertedRegions', () => {
        const { language } = settingsStore.getSettings();
        const { oblasts, raions, kyivRaions } = getLatestAlertedRegions();
        return {
            oblasts: withAlertTypeName(oblasts, language),
            raions: withAlertTypeName(raions, language),

            kyivRaions: kyivRaions || [],
        };
    });

    ipcMain.handle('liveMap:getOccupiedTerritory', () => getLatestOccupiedTerritory());

    ipcMain.handle('liveMap:getTitleBarAccentColor', () => getTitleBarAccentColor());

    ipcMain.handle('liveMap:consumePendingKyivMode', () => consumePendingKyivMode());

    if (typeof systemPreferences.on === 'function') {
        systemPreferences.on('accent-color-changed', () => {
            const win = getLiveMapWindow();
            if (win) win.webContents.send('liveMap:titleBarAccentColorChanged', getTitleBarAccentColor());
        });
    }

    ipcMain.handle('liveMap:takeScreenshot', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return false;

        try {
            const image = await win.webContents.capturePage();
            clipboard.writeImage(image);
            return true;
        } catch (err) {
            logEvent(`Live map screenshot failed: ${err.message}`, 'ERROR');
            return false;
        }
    });
}

module.exports = { registerLiveMapIpc };

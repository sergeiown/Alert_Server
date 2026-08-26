// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const { getResourcePath } = require('../services/appPaths');
const { getLatestTotalAlertCount, getLatestAlertedRegions } = require('../services/alertState');
const { getLatestOccupiedTerritory } = require('../services/occupiedTerritoryStore');
const { alertTypeName } = require('../services/alertTypes');
const settingsStore = require('../services/settingsStore');

// Resolved to a display name here, at request time, using whatever language is current right now
// - so a language change takes effect immediately without needing computeAlertedRegions to redo
// its work, and the renderer never needs its own copy of the alert-type catalog.
function withAlertTypeName(entries, language) {
    return entries.map((entry) => ({
        ...entry,
        alertTypeName: entry.alertType ? alertTypeName(entry.alertType, language) : null,
    }));
}

function registerLiveMapIpc() {
    ipcMain.handle('liveMap:getBaseMapUrl', () => {
        const filePath = getResourcePath('icons', 'ukraine_live_map.svg').replace(/\\/g, '/');
        return `file://${filePath}`;
    });

    ipcMain.handle('liveMap:getActiveAlertCount', () => getLatestTotalAlertCount());

    ipcMain.handle('liveMap:getAlertedRegions', () => {
        const { language } = settingsStore.getSettings();
        const { oblasts, raions } = getLatestAlertedRegions();
        return { oblasts: withAlertTypeName(oblasts, language), raions: withAlertTypeName(raions, language) };
    });

    ipcMain.handle('liveMap:getOccupiedTerritory', () => getLatestOccupiedTerritory());
}

module.exports = { registerLiveMapIpc };

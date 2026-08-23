// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const { getResourcePath } = require('../services/appPaths');
const { getLatestTotalAlertCount, getLatestAlertedRegions } = require('../services/alertState');
const { getLatestOccupiedTerritory } = require('../services/occupiedTerritoryStore');

function registerLiveMapIpc() {
    ipcMain.handle('liveMap:getBaseMapUrl', () => {
        const filePath = getResourcePath('icons', 'ukraine_live_map.svg').replace(/\\/g, '/');
        return `file://${filePath}`;
    });

    ipcMain.handle('liveMap:getActiveAlertCount', () => getLatestTotalAlertCount());

    ipcMain.handle('liveMap:getAlertedRegions', () => getLatestAlertedRegions());

    ipcMain.handle('liveMap:getOccupiedTerritory', () => getLatestOccupiedTerritory());
}

module.exports = { registerLiveMapIpc };

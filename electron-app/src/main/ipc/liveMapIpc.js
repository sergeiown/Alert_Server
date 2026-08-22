const { ipcMain } = require('electron');
const { getResourcePath } = require('../services/appPaths');
const { getLatestTotalAlertCount, getLatestAlertedRegions } = require('../services/alertState');

function registerLiveMapIpc() {
    ipcMain.handle('liveMap:getBaseMapUrl', () => {
        const filePath = getResourcePath('icons', 'ukraine_live_map.svg').replace(/\\/g, '/');
        return `file://${filePath}`;
    });

    ipcMain.handle('liveMap:getActiveAlertCount', () => getLatestTotalAlertCount());

    ipcMain.handle('liveMap:getAlertedRegions', () => getLatestAlertedRegions());
}

module.exports = { registerLiveMapIpc };

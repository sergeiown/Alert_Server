const { ipcMain } = require('electron');
const { getResourcePath } = require('../services/appPaths');

function registerLiveMapIpc() {
    ipcMain.handle('liveMap:getBaseMapUrl', () => {
        const filePath = getResourcePath('icons', 'ukraine_live_map.svg').replace(/\\/g, '/');
        return `file://${filePath}`;
    });
}

module.exports = { registerLiveMapIpc };

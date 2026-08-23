const { ipcMain } = require('electron');
const { getLatestWeaponStats } = require('../services/weaponStatsStore');

function registerTrendsIpc() {
    ipcMain.handle('trends:getWeaponStats', () => getLatestWeaponStats());
}

module.exports = { registerTrendsIpc };

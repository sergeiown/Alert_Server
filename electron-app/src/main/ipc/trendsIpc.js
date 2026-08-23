// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const { getLatestWeaponStats } = require('../services/weaponStatsStore');

function registerTrendsIpc() {
    ipcMain.handle('trends:getWeaponStats', () => getLatestWeaponStats());
}

module.exports = { registerTrendsIpc };

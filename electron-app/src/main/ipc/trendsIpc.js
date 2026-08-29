// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const { getLatestWeaponStats } = require('../services/weaponStatsStore');
const { getTodayStats } = require('../services/dailyAlertStats');
const regionsStore = require('../services/regionsStore');

function registerTrendsIpc() {
    ipcMain.handle('trends:getWeaponStats', () => getLatestWeaponStats());
    ipcMain.handle('trends:getTodayStats', () => getTodayStats(regionsStore.getSelectedUids()));
}

module.exports = { registerTrendsIpc };

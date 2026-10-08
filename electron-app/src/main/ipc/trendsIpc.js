// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const { getLatestWeaponStats } = require('../services/weaponStatsStore');
const { getLatestTodayStats } = require('../services/todayStatsStore');
const { getThreatTrends } = require('../services/threatTrendsStore');
const regionsStore = require('../services/regionsStore');

function registerTrendsIpc() {
    ipcMain.handle('trends:getWeaponStats', () => getLatestWeaponStats());
    ipcMain.handle('trends:getThreatTrends', (event, days) => getThreatTrends(Number.isFinite(days) ? days : undefined));
    ipcMain.handle('trends:getTodayStats', () => getLatestTodayStats(regionsStore.getSelectedUids()));
}

module.exports = { registerTrendsIpc };

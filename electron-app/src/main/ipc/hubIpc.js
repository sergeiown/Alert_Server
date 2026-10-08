// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const { navigate, goBack, requestClose, currentState, minimizeHub, toggleMaximizeHub } = require('../windows/hubWindow');
const { getActiveCount } = require('../services/notifier');
const { getLatestTotalAlertCount } = require('../services/alertState');

function registerHubIpc() {
    ipcMain.handle('hub:getState', () => currentState());
    ipcMain.handle('hub:navigate', (event, view) => navigate(String(view)));
    ipcMain.handle('hub:back', () => goBack());
    ipcMain.handle('hub:close', () => requestClose());
    ipcMain.handle('hub:minimize', () => minimizeHub());
    ipcMain.handle('hub:toggleMaximize', () => toggleMaximizeHub());
    ipcMain.handle('hub:getSummary', () => ({
        activeCount: getActiveCount(),
        totalCount: getLatestTotalAlertCount(),
    }));
}

module.exports = { registerHubIpc };

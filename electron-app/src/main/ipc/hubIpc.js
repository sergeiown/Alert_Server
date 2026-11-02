// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const { navigate, openFeedback, takeFeedbackRequest, goBack, requestClose, currentState, minimizeHub, toggleMaximizeHub } = require('../windows/hubWindow');
const { getActiveCount } = require('../services/notifier');
const { getLatestTotalAlertCount, getLatestMatchedAlerts } = require('../services/alertState');
const { worstLevelAmong } = require('../services/alertLevels');

function registerHubIpc() {
    ipcMain.handle('hub:getState', () => currentState());
    ipcMain.handle('hub:navigate', (event, view) => navigate(String(view)));
    ipcMain.handle('hub:openFeedback', () => openFeedback());
    ipcMain.handle('hub:takeFeedbackRequest', () => takeFeedbackRequest());
    ipcMain.handle('hub:back', () => goBack());
    ipcMain.handle('hub:close', () => requestClose());
    ipcMain.handle('hub:minimize', () => minimizeHub());
    ipcMain.handle('hub:toggleMaximize', () => toggleMaximizeHub());
    ipcMain.handle('hub:getSummary', () => ({
        activeCount: getActiveCount(),
        totalCount: getLatestTotalAlertCount(),
        level: worstLevelAmong(getLatestMatchedAlerts()),
    }));
}

module.exports = { registerHubIpc };

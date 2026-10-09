// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain, nativeImage } = require('electron');
const settingsStore = require('../services/settingsStore');
const { getResourcePath } = require('../services/appPaths');
const { getRegionOverviews } = require('../services/regionOverview');

function registerStatusIpc() {
    ipcMain.handle('app:getIcon', () =>
        nativeImage.createFromPath(getResourcePath('icons', 'app-icon-256.png')).toDataURL()
    );

    ipcMain.handle('status:getOverview', () => getRegionOverviews(settingsStore.getSettings().language));
}

module.exports = { registerStatusIpc };

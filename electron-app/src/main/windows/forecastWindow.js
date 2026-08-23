// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { BrowserWindow } = require('electron');

let forecastWindow = null;

function openForecastWindow() {
    if (forecastWindow) {
        forecastWindow.show();
        forecastWindow.focus();
        return forecastWindow;
    }

    forecastWindow = new BrowserWindow({
        width: 640,
        height: 560,
        title: 'Alert Server - Forecast',
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'app-icon-256.png'),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload', 'forecastPreload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    forecastWindow.setMenuBarVisibility(false);
    forecastWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'forecast', 'index.html'));

    forecastWindow.on('closed', () => {
        forecastWindow = null;
    });

    return forecastWindow;
}

function notifyRegionsChanged() {
    if (forecastWindow) forecastWindow.webContents.send('regions:changed');
}

module.exports = { openForecastWindow, notifyRegionsChanged };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { BrowserWindow } = require('electron');

let trendsWindow = null;

function openTrendsWindow() {
    if (trendsWindow) {
        trendsWindow.show();
        trendsWindow.focus();
        return trendsWindow;
    }

    trendsWindow = new BrowserWindow({
        width: 820,
        height: 640,
        title: 'Alert Server - Trends',
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'app-icon-256.png'),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload', 'trendsPreload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    trendsWindow.setMenuBarVisibility(false);
    trendsWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'trends', 'index.html'));

    trendsWindow.on('closed', () => {
        trendsWindow = null;
    });

    return trendsWindow;
}

module.exports = { openTrendsWindow };

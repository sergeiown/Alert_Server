// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { BrowserWindow } = require('electron');

let liveMapWindow = null;

function openLiveMapWindow() {
    if (liveMapWindow) {
        liveMapWindow.show();
        liveMapWindow.focus();
        return liveMapWindow;
    }

    liveMapWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Alert Server - Live map',
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'app-icon-256.png'),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload', 'liveMapPreload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    liveMapWindow.setMenuBarVisibility(false);
    liveMapWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'liveMap', 'index.html'));

    liveMapWindow.on('closed', () => {
        liveMapWindow = null;
    });

    return liveMapWindow;
}

module.exports = { openLiveMapWindow };

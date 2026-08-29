// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { BrowserWindow } = require('electron');

let logWindow = null;

function openLogWindow() {
    if (logWindow) {
        logWindow.show();
        logWindow.focus();
        return logWindow;
    }

    logWindow = new BrowserWindow({
        width: 860,
        height: 600,
        title: 'Alert Server - Event log',
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'app-icon-256.png'),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload', 'logPreload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    logWindow.setMenuBarVisibility(false);
    logWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'log', 'index.html'));

    logWindow.on('closed', () => {
        logWindow = null;
    });

    return logWindow;
}

module.exports = { openLogWindow };

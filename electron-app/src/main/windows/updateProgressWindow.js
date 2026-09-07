// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { BrowserWindow } = require('electron');

let updateProgressWindow = null;

// `visible: false` creates the window hidden - used to get an always-on-top native handle to
// anchor the "install now?" confirmation dialog to (see updater.js) before there's anything to
// actually show in it yet, so that dialog inherits the same topmost behavior instead of being
// left free to end up buried behind the live map or any other window.
function openUpdateProgressWindow({ visible = true } = {}) {
    if (updateProgressWindow) {
        if (visible) updateProgressWindow.show();
        return updateProgressWindow;
    }

    updateProgressWindow = new BrowserWindow({
        width: 360,
        height: 210,
        resizable: false,
        alwaysOnTop: true,
        show: visible,
        title: 'Alert Server - Update',
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'app-icon-256.png'),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload', 'updateProgressPreload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    updateProgressWindow.setMenuBarVisibility(false);
    updateProgressWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'updateProgress', 'index.html'));

    updateProgressWindow.on('closed', () => {
        updateProgressWindow = null;
    });

    return updateProgressWindow;
}

function setUpdateProgress(percent) {
    if (updateProgressWindow) updateProgressWindow.webContents.send('update:progress', percent);
}

function setUpdateStatus(text) {
    if (updateProgressWindow) updateProgressWindow.webContents.send('update:status', text);
}

function closeUpdateProgressWindow() {
    if (updateProgressWindow) updateProgressWindow.close();
}

module.exports = { openUpdateProgressWindow, setUpdateProgress, setUpdateStatus, closeUpdateProgressWindow };

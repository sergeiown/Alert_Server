const path = require('path');
const { BrowserWindow } = require('electron');

let updateProgressWindow = null;

function openUpdateProgressWindow() {
    if (updateProgressWindow) {
        updateProgressWindow.show();
        return updateProgressWindow;
    }

    updateProgressWindow = new BrowserWindow({
        width: 360,
        height: 210,
        resizable: false,
        alwaysOnTop: true,
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

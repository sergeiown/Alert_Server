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
        width: 720,
        height: 560,
        title: 'Alert Server - Log',
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'tray.ico'),
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

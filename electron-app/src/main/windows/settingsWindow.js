const path = require('path');
const { BrowserWindow } = require('electron');

let settingsWindow = null;

function openSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.show();
        settingsWindow.focus();
        return settingsWindow;
    }

    settingsWindow = new BrowserWindow({
        width: 720,
        height: 640,
        title: 'Alert Server — Налаштування',
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'tray.ico'),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload', 'settingsPreload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    settingsWindow.setMenuBarVisibility(false);
    settingsWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'settings', 'index.html'));

    settingsWindow.on('close', (event) => {
        event.preventDefault();
        settingsWindow.hide();
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });

    return settingsWindow;
}

function destroySettingsWindow() {
    if (settingsWindow) {
        settingsWindow.removeAllListeners('close');
        settingsWindow.destroy();
        settingsWindow = null;
    }
}

module.exports = { openSettingsWindow, destroySettingsWindow };

const path = require('path');
const { BrowserWindow } = require('electron');

let aboutWindow = null;

function openAboutWindow() {
    if (aboutWindow) {
        aboutWindow.show();
        aboutWindow.focus();
        return aboutWindow;
    }

    aboutWindow = new BrowserWindow({
        width: 360,
        height: 420,
        resizable: false,
        title: 'Alert Server - About',
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'tray.ico'),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload', 'aboutPreload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    aboutWindow.setMenuBarVisibility(false);
    aboutWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'about', 'index.html'));

    aboutWindow.on('closed', () => {
        aboutWindow = null;
    });

    return aboutWindow;
}

module.exports = { openAboutWindow };

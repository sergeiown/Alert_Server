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
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'tray.ico'),
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

module.exports = { openForecastWindow };

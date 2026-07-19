const { BrowserWindow } = require('electron');

let mapWindow = null;

function openMapWindow(url, title) {
    if (mapWindow) {
        mapWindow.loadURL(url);
        mapWindow.setTitle(title);
        mapWindow.show();
        mapWindow.focus();
        return mapWindow;
    }

    mapWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title,
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
        },
    });

    mapWindow.setMenuBarVisibility(false);
    mapWindow.loadURL(url);

    mapWindow.on('closed', () => {
        mapWindow = null;
    });

    return mapWindow;
}

module.exports = { openMapWindow };

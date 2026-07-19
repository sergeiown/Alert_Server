const path = require('path');
const { BrowserWindow, screen } = require('electron');

let popupWindow = null;

function createPopupWindow() {
    popupWindow = new BrowserWindow({
        width: 320,
        height: 260,
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'tray.ico'),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload', 'trayPopupPreload.js'),
            contextIsolation: true,
            sandbox: true,
        },
    });

    popupWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'trayPopup', 'index.html'));

    popupWindow.on('blur', () => {
        popupWindow.hide();
    });

    return popupWindow;
}

function positionNearTray(trayBounds) {
    const windowBounds = popupWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    const workArea = display.workArea;

    let x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - windowBounds.width));

    const taskbarAtBottom = trayBounds.y > workArea.y + workArea.height / 2;
    const y = taskbarAtBottom
        ? trayBounds.y - windowBounds.height - 8
        : trayBounds.y + trayBounds.height + 8;

    popupWindow.setPosition(x, y, false);
}

function toggleTrayPopup(trayBounds) {
    if (!popupWindow) createPopupWindow();

    if (popupWindow.isVisible()) {
        popupWindow.hide();
        return;
    }

    positionNearTray(trayBounds);
    popupWindow.show();
    popupWindow.focus();
    popupWindow.webContents.send('refresh');
}

module.exports = { toggleTrayPopup };

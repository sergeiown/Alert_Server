// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { BrowserWindow, screen } = require('electron');

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 260;

const MIN_HEIGHT = 90;
const MAX_HEIGHT = 500;

let popupWindow = null;
let lastTrayBounds = null;

function createPopupWindow() {
    popupWindow = new BrowserWindow({
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        icon: path.join(__dirname, '..', '..', '..', 'resources', 'icons', 'app-icon-256.png'),
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

    lastTrayBounds = trayBounds;
    positionNearTray(trayBounds);
    popupWindow.show();
    popupWindow.focus();
    popupWindow.webContents.send('refresh');
}

function setContentHeight(height) {
    if (!popupWindow) return height;
    const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)));
    popupWindow.setSize(DEFAULT_WIDTH, clamped);
    if (lastTrayBounds) positionNearTray(lastTrayBounds);
    return clamped;
}

module.exports = { toggleTrayPopup, setContentHeight };

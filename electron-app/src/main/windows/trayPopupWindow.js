// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { BrowserWindow, screen } = require('electron');

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 260;
// Real content can range from "no alerts, one line of text" to several full alert cards -
// clamped so a measurement glitch (or a genuinely huge amount of text) can't shrink the window to
// nothing or grow it off-screen.
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

// Called by the renderer once it knows its own real content height (measured from the actual
// rendered DOM - header + exactly one alert card's height + the forecast footer, capped there even
// if several alerts are active, so the popup stays "one alert tall" and scrolls for the rest
// rather than growing without bound). Height only - width stays fixed - and repositioned against
// the same tray click that opened it, since the anchor position depends on the window's own height
// (see the taskbar-at-bottom case above).
function setContentHeight(height) {
    if (!popupWindow) return;
    const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)));
    popupWindow.setSize(DEFAULT_WIDTH, clamped);
    if (lastTrayBounds) positionNearTray(lastTrayBounds);
}

module.exports = { toggleTrayPopup, setContentHeight };

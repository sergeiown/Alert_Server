// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { BrowserWindow, ipcMain, nativeTheme } = require('electron');
const { lockSelection } = require('../services/selectionLock');
const { getResourcePath } = require('../services/appPaths');

const WINDOW_WIDTH = 460;
const FALLBACK_SHOW_MS = 1500;

const dialogs = new Map();

function backgroundColor() {
    return nativeTheme.shouldUseDarkColors ? '#101720' : '#d5e1ee';
}

function settle(webContentsId, choice) {
    const entry = dialogs.get(webContentsId);
    if (!entry) return;
    dialogs.delete(webContentsId);
    entry.resolve(choice);
    if (!entry.window.isDestroyed()) entry.window.close();
}

function reveal(entry) {
    const win = entry.window;
    if (win.isDestroyed() || win.isVisible()) return;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.center();
    win.show();
    win.focus();
    win.moveTop();
}

function entryFor(event) {
    return dialogs.get(event.sender.id);
}

ipcMain.handle('messageWindow:getInfo', (event) => {
    const entry = entryFor(event);
    return entry ? entry.info : null;
});

ipcMain.on('messageWindow:choose', (event, id) => {
    const entry = entryFor(event);
    if (!entry) return;
    const allowed = entry.info.buttons.some((button) => button.id === id);
    settle(event.sender.id, allowed ? id : entry.info.cancelId);
});

ipcMain.on('messageWindow:fit', (event, height) => {
    const entry = entryFor(event);
    if (!entry || entry.window.isDestroyed()) return;
    entry.window.setContentSize(WINDOW_WIDTH, Math.max(140, Math.min(640, Math.ceil(Number(height) || 0))));
    reveal(entry);
});

function showMessage({ title, message, detail, buttons, cancelId }) {
    const info = {
        title: title || '',
        message: message || '',
        detail: detail || '',
        buttons: buttons && buttons.length ? buttons : [{ id: 'close', label: 'OK', primary: true }],
        cancelId: cancelId !== undefined ? cancelId : buttons && buttons.length ? buttons[buttons.length - 1].id : 'close',
    };

    return new Promise((resolve) => {
        const win = new BrowserWindow({
            width: WINDOW_WIDTH,
            height: 240,
            useContentSize: true,
            resizable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            alwaysOnTop: true,
            show: false,
            title: info.title || 'Alert Server',
            backgroundColor: backgroundColor(),
            icon: getResourcePath('icons', 'app-icon-256.png'),
            webPreferences: {
                preload: path.join(__dirname, '..', '..', 'preload', 'messageWindowPreload.js'),
                contextIsolation: true,
                sandbox: true,
                nodeIntegration: false,
            },
        });

        const id = win.webContents.id;
        const entry = { window: win, info, resolve };
        dialogs.set(id, entry);

        win.setMenuBarVisibility(false);
        lockSelection(win.webContents);
        win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'messageWindow', 'index.html'));
        win.once('ready-to-show', () => setTimeout(() => reveal(entry), FALLBACK_SHOW_MS));

        win.on('closed', () => {
            if (dialogs.has(id)) {
                dialogs.delete(id);
                resolve(info.cancelId);
            }
        });
    });
}

module.exports = { showMessage };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');
const { lockSelection } = require('../services/selectionLock');
const { getResourcePath } = require('../services/appPaths');

const WINDOW_WIDTH = 520;
const FALLBACK_SHOW_MS = 1500;

let promptWindow = null;
let pending = null;

function settle(choice) {
    if (!pending) return;
    const { resolve } = pending;
    pending = null;
    resolve(choice);
    if (promptWindow && !promptWindow.isDestroyed()) promptWindow.close();
}

function reveal() {
    if (!promptWindow || promptWindow.isDestroyed() || promptWindow.isVisible()) return;
    promptWindow.setAlwaysOnTop(true, 'screen-saver');
    promptWindow.center();
    promptWindow.show();
    promptWindow.focus();
    promptWindow.moveTop();
}

ipcMain.handle('updatePrompt:getInfo', () => (pending ? pending.info : null));

ipcMain.on('updatePrompt:choose', (event, choice) => {
    if (pending && promptWindow && event.sender === promptWindow.webContents) settle(choice === 'install' ? 'install' : 'later');
});

ipcMain.on('updatePrompt:fit', (event, height) => {
    if (!promptWindow || promptWindow.isDestroyed() || event.sender !== promptWindow.webContents) return;
    promptWindow.setContentSize(WINDOW_WIDTH, Math.max(240, Math.min(720, Math.ceil(Number(height) || 0))));
    reveal();
});

function askToUpdate(info) {
    if (pending) return pending.promise;

    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    pending = { info, resolve, promise };

    promptWindow = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: 400,
        useContentSize: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        closable: info.kind !== 'forced',
        alwaysOnTop: true,
        show: false,
        title: 'Alert Server',
        icon: getResourcePath('icons', 'app-icon-256.png'),
        webPreferences: {
            preload: path.join(__dirname, '..', '..', 'preload', 'updatePromptPreload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    promptWindow.setMenuBarVisibility(false);
    lockSelection(promptWindow.webContents);
    promptWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'updatePrompt', 'index.html'));

    promptWindow.once('ready-to-show', () => setTimeout(reveal, FALLBACK_SHOW_MS));

    promptWindow.on('close', (event) => {
        if (pending && pending.info.kind === 'forced') event.preventDefault();
    });

    promptWindow.on('closed', () => {
        promptWindow = null;
        if (pending) {
            const { resolve: done } = pending;
            pending = null;
            done('later');
        }
    });

    return promise;
}

module.exports = { askToUpdate };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { pathToFileURL } = require('url');
const { BrowserWindow, ipcMain } = require('electron');
const { logEvent } = require('./logger');

let windowPromise = null;
let nextId = 1;
const pending = new Map();

function ensureWindow() {
    if (windowPromise) return windowPromise;
    windowPromise = new Promise((resolve) => {
        const win = new BrowserWindow({
            show: false,
            width: 1,
            height: 1,
            skipTaskbar: true,
            webPreferences: {
                preload: path.join(__dirname, '..', '..', 'preload', 'soundPreload.js'),
                contextIsolation: true,
                sandbox: true,
                autoplayPolicy: 'no-user-gesture-required',
                backgroundThrottling: false,
            },
        });
        win.on('closed', () => {
            windowPromise = null;
            pending.forEach((done) => done(new Error('sound window closed')));
            pending.clear();
        });
        win.webContents.once('did-finish-load', () => resolve(win));
        win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'sound', 'index.html'));
    });
    return windowPromise;
}

ipcMain.on('sound:ended', (event, id, error) => {
    const done = pending.get(id);
    if (!done) return;
    pending.delete(id);
    done(error ? new Error(String(error)) : null);
});

function play(filePath, volume, done) {
    const id = nextId++;
    let finished = false;
    const finish = (err) => {
        if (finished) return;
        finished = true;
        pending.delete(id);
        done(err);
    };
    pending.set(id, finish);
    ensureWindow().then((win) => {
        if (finished || win.isDestroyed()) return;
        win.webContents.send('sound:play', { id, url: pathToFileURL(filePath).href, volume: Math.max(0, Math.min(1, volume)) });
    });
    return {
        kill() {
            if (finished) return;
            ensureWindow().then((win) => {
                if (!win.isDestroyed()) win.webContents.send('sound:stop', id);
            });
            finish(null);
        },
    };
}

function warmUp() {
    ensureWindow().catch((err) => logEvent(`Sound window error: ${err.message}`, 'ERROR'));
}

module.exports = { play, warmUp };

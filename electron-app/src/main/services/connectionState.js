// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain, net, webContents } = require('electron');
const { createConnectionState } = require('./connectionStateCore');

const POLL_INTERVAL_MS = 5000;

function broadcast(state) {
    webContents.getAllWebContents().forEach((contents) => {
        if (!contents.isDestroyed()) contents.send('connection:changed', state);
    });
}

const shared = createConnectionState({ onChange: broadcast });

let started = false;

function start() {
    if (started) return;
    started = true;
    ipcMain.handle('connection:get', () => shared.get());
    ipcMain.on('connection:report', (event, online) => shared.setOnline(online));
    shared.setOnline(net.isOnline());
    setInterval(() => shared.setOnline(net.isOnline()), POLL_INTERVAL_MS).unref();
}

module.exports = {
    start,
    setNoData: shared.setNoData,
    getConnectionState: shared.get,
};

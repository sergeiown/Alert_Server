// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerSound', {
    onPlay: (callback) => ipcRenderer.on('sound:play', (event, request) => callback(request)),
    onStop: (callback) => ipcRenderer.on('sound:stop', (event, id) => callback(id)),
    ended: (id, error) => ipcRenderer.send('sound:ended', id, error || null),
});

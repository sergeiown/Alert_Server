// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerUpdate', {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    getIcon: () => ipcRenderer.invoke('system:getAboutIcon'),
    onProgress: (callback) => ipcRenderer.on('update:progress', (event, percent) => callback(percent)),
    onStatus: (callback) => ipcRenderer.on('update:status', (event, text) => callback(text)),
});

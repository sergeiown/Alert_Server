// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerAbout', {
    getVersion: () => ipcRenderer.invoke('system:getVersion'),
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    getConnectionState: () => ipcRenderer.invoke('connection:get'),
    onConnectionChange: (callback) => ipcRenderer.on('connection:changed', (event, state) => callback(state)),
    reportOnline: (online) => ipcRenderer.send('connection:report', online),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
});

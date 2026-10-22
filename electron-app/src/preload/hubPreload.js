// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerHub', {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    getConnectionState: () => ipcRenderer.invoke('connection:get'),
    onConnectionChange: (callback) => ipcRenderer.on('connection:changed', (event, state) => callback(state)),
    reportOnline: (online) => ipcRenderer.send('connection:report', online),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getIcon: () => ipcRenderer.invoke('app:getIcon'),
    checkForUpdates: () => ipcRenderer.invoke('system:checkForUpdates'),
    getSummary: () => ipcRenderer.invoke('hub:getSummary'),
    getState: () => ipcRenderer.invoke('hub:getState'),
    onState: (callback) => ipcRenderer.on('hub:state', (event, state) => callback(state)),
    navigate: (view) => ipcRenderer.invoke('hub:navigate', view),
    back: () => ipcRenderer.invoke('hub:back'),
    close: () => ipcRenderer.invoke('hub:close'),
    minimize: () => ipcRenderer.invoke('hub:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('hub:toggleMaximize'),
});

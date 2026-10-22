// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerTrends', {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    getConnectionState: () => ipcRenderer.invoke('connection:get'),
    onConnectionChange: (callback) => ipcRenderer.on('connection:changed', (event, state) => callback(state)),
    reportOnline: (online) => ipcRenderer.send('connection:report', online),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    getWeaponStats: () => ipcRenderer.invoke('trends:getWeaponStats'),
    getThreatTrends: (days) => ipcRenderer.invoke('trends:getThreatTrends', days),
    getTodayStats: () => ipcRenderer.invoke('trends:getTodayStats'),
});

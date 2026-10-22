// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerLiveMap', {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    getConnectionState: () => ipcRenderer.invoke('connection:get'),
    onConnectionChange: (callback) => ipcRenderer.on('connection:changed', (event, state) => callback(state)),
    reportOnline: (online) => ipcRenderer.send('connection:report', online),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    getBaseMapUrl: () => ipcRenderer.invoke('liveMap:getBaseMapUrl'),
    getActiveAlertCount: () => ipcRenderer.invoke('liveMap:getActiveAlertCount'),
    getDailyPeaks: () => ipcRenderer.invoke('liveMap:getDailyPeaks'),
    getAlertedRegions: () => ipcRenderer.invoke('liveMap:getAlertedRegions'),
    getOccupiedTerritory: () => ipcRenderer.invoke('liveMap:getOccupiedTerritory'),
    getThreats: () => ipcRenderer.invoke('liveMap:getThreats'),
    onThreatsUpdated: (callback) => ipcRenderer.on('liveMap:threatsUpdated', (event, threats) => callback(threats)),
    takeScreenshot: () => ipcRenderer.invoke('liveMap:takeScreenshot'),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
    onForceKyivMode: (callback) => ipcRenderer.on('liveMap:forceKyivMode', () => callback()),
    consumePendingKyivMode: () => ipcRenderer.invoke('liveMap:consumePendingKyivMode'),
});

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerLiveMap', {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    getBaseMapUrl: () => ipcRenderer.invoke('liveMap:getBaseMapUrl'),
    getActiveAlertCount: () => ipcRenderer.invoke('liveMap:getActiveAlertCount'),
    getAlertedRegions: () => ipcRenderer.invoke('liveMap:getAlertedRegions'),
    getOccupiedTerritory: () => ipcRenderer.invoke('liveMap:getOccupiedTerritory'),
    takeScreenshot: () => ipcRenderer.invoke('liveMap:takeScreenshot'),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
});

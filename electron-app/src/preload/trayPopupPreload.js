// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerTrayPopup', {
    getAlerts: () => ipcRenderer.invoke('trayPopup:getAlerts'),
    getForecast: () => ipcRenderer.invoke('trayPopup:getForecast'),
    openForecast: () => ipcRenderer.invoke('trayPopup:openForecast'),
    getIcon: () => ipcRenderer.invoke('trayPopup:getIcon'),
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    onRefresh: (callback) => ipcRenderer.on('refresh', callback),
});

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerUpdatePrompt', {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    getIcon: () => ipcRenderer.invoke('system:getAboutIcon'),
    getInfo: () => ipcRenderer.invoke('updatePrompt:getInfo'),
    choose: (choice) => ipcRenderer.send('updatePrompt:choose', choice),
    fit: (height) => ipcRenderer.send('updatePrompt:fit', height),
});

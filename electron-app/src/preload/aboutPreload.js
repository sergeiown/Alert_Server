// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerAbout', {
    getVersion: () => ipcRenderer.invoke('system:getVersion'),
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
});

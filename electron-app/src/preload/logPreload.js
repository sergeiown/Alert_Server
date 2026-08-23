// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerLog', {
    getContent: () => ipcRenderer.invoke('log:getContent'),
    clear: () => ipcRenderer.invoke('log:clear'),
    openInNotepad: () => ipcRenderer.invoke('log:openInNotepad'),
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
});

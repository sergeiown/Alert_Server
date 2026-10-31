// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerMessage', {
    getInfo: () => ipcRenderer.invoke('messageWindow:getInfo'),
    choose: (id) => ipcRenderer.send('messageWindow:choose', id),
    fit: (height) => ipcRenderer.send('messageWindow:fit', height),
});

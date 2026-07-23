const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerLog', {
    getContent: () => ipcRenderer.invoke('log:getContent'),
    clear: () => ipcRenderer.invoke('log:clear'),
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerAbout', {
    getVersion: () => ipcRenderer.invoke('system:getVersion'),
    getIcon: () => ipcRenderer.invoke('system:getAboutIcon'),
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerLiveMap', {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    getBaseMapUrl: () => ipcRenderer.invoke('liveMap:getBaseMapUrl'),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
});

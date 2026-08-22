const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerLiveMap', {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    getBaseMapUrl: () => ipcRenderer.invoke('liveMap:getBaseMapUrl'),
    getActiveAlertCount: () => ipcRenderer.invoke('liveMap:getActiveAlertCount'),
    getAlertedRegions: () => ipcRenderer.invoke('liveMap:getAlertedRegions'),
    getOccupiedTerritory: () => ipcRenderer.invoke('liveMap:getOccupiedTerritory'),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
});

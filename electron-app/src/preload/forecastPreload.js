const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerForecast', {
    getRegions: () => ipcRenderer.invoke('forecast:getRegions'),
    getRegionForecast: (uid) => ipcRenderer.invoke('forecast:getRegionForecast', uid),
    getLocalStats: () => ipcRenderer.invoke('forecast:getLocalStats'),
    clearLocalStats: () => ipcRenderer.invoke('forecast:clearLocalStats'),
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    copyToClipboard: (text) => ipcRenderer.invoke('system:copyToClipboard', text),
    onRegionsChanged: (callback) => ipcRenderer.on('regions:changed', callback),
});

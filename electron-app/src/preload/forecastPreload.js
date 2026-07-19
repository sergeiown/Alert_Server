const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerForecast', {
    getRegions: () => ipcRenderer.invoke('forecast:getRegions'),
    getRegionForecast: (uid) => ipcRenderer.invoke('forecast:getRegionForecast', uid),
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    copyToClipboard: (text) => ipcRenderer.invoke('system:copyToClipboard', text),
});

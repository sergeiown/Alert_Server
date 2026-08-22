const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerLiveMap', {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
});

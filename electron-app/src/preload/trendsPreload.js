const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerTrends', {
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    getSettings: () => ipcRenderer.invoke('settings:get'),
    getWeaponStats: () => ipcRenderer.invoke('trends:getWeaponStats'),
});

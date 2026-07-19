const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServerTrayPopup', {
    getAlerts: () => ipcRenderer.invoke('trayPopup:getAlerts'),
    getIcon: () => ipcRenderer.invoke('trayPopup:getIcon'),
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
    onRefresh: (callback) => ipcRenderer.on('refresh', callback),
});

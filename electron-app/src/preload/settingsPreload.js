const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServer', {
    getSettings: () => ipcRenderer.invoke('settings:get'),
    setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getRegionTree: () => ipcRenderer.invoke('regions:getTree'),
    getMapSvg: () => ipcRenderer.invoke('regions:getMapSvg'),
    getSelectedRegions: () => ipcRenderer.invoke('regions:getSelected'),
    setSelectedRegions: (uids) => ipcRenderer.invoke('regions:setSelected', uids),
    toggleRegion: (uid) => ipcRenderer.invoke('regions:toggle', uid),
    getLoginItem: () => ipcRenderer.invoke('system:getLoginItem'),
    setLoginItem: (openAtLogin) => ipcRenderer.invoke('system:setLoginItem', openAtLogin),
    getStrings: () => ipcRenderer.invoke('i18n:getStrings'),
});

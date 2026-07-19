const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alertServer', {
    getSettings: () => ipcRenderer.invoke('settings:get'),
    setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getRegionTree: () => ipcRenderer.invoke('regions:getTree'),
    getSelectedRegions: () => ipcRenderer.invoke('regions:getSelected'),
    setSelectedRegions: (uids) => ipcRenderer.invoke('regions:setSelected', uids),
    toggleRegion: (uid) => ipcRenderer.invoke('regions:toggle', uid),
});

const fs = require('fs');
const { ipcMain } = require('electron');
const { getResourcePath } = require('../services/appPaths');
const regionsStore = require('../services/regionsStore');

let cachedTree = null;

function getTree() {
    if (!cachedTree) {
        cachedTree = JSON.parse(fs.readFileSync(getResourcePath('data', 'locations.json'), 'utf-8'));
    }
    return cachedTree;
}

function registerRegionsIpc() {
    ipcMain.handle('regions:getTree', () => getTree());
    ipcMain.handle('regions:getSelected', () => regionsStore.getSelectedUids());
    ipcMain.handle('regions:setSelected', (event, uids) => {
        regionsStore.setSelectedUids(uids);
        return regionsStore.getSelectedUids();
    });
    ipcMain.handle('regions:toggle', (event, uid) => regionsStore.toggleUid(uid));
}

module.exports = { registerRegionsIpc };

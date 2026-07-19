const fs = require('fs');
const { ipcMain } = require('electron');
const { getResourcePath } = require('../services/appPaths');
const regionsStore = require('../services/regionsStore');
const { logEvent } = require('../services/logger');

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
        logEvent(`Selected regions replaced: ${uids.length} region(s)`);
        return regionsStore.getSelectedUids();
    });
    ipcMain.handle('regions:toggle', (event, uid) => {
        const isSelected = regionsStore.toggleUid(uid);
        logEvent(`Region ${uid} ${isSelected ? 'added to' : 'removed from'} monitoring`);
        return isSelected;
    });
}

module.exports = { registerRegionsIpc };

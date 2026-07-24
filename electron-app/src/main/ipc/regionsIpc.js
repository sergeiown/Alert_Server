const fs = require('fs');
const { ipcMain } = require('electron');
const { getResourcePath } = require('../services/appPaths');
const regionsStore = require('../services/regionsStore');
const discoveredLocationsStore = require('../services/discoveredLocationsStore');
const regionAvailability = require('../services/regionAvailability');
const { logEvent } = require('../services/logger');

let cachedTree = null;
let cachedMapSvg = null;

function mergeDiscoveredLocations(tree) {
    const discovered = discoveredLocationsStore.getAll();
    const stateByName = new Map(tree.states.map((state) => [state.stateName, state]));

    Object.entries(discovered).forEach(([uid, info]) => {
        const state = stateByName.get(info.oblast);
        if (!state) return;
        if (state.districts.some((district) => district.uid === Number(uid))) return;

        state.districts.push({
            districtName: info.title,
            districtNameLat: info.title,
            uid: Number(uid),
            communities: [],
        });
    });

    return tree;
}

function filterByAvailability(tree) {
    const filterCommunities = (communities) => communities.filter((c) => regionAvailability.isUidAssigned(c.uid));

    const filterDistricts = (districts) =>
        districts
            .map((d) => ({ ...d, communities: filterCommunities(d.communities) }))
            .filter((d) => regionAvailability.isUidAssigned(d.uid) || d.communities.length > 0);

    return {
        states: tree.states
            .map((s) => ({ ...s, districts: filterDistricts(s.districts) }))
            .filter((s) => regionAvailability.isUidAssigned(s.uid) || s.districts.length > 0),
    };
}

async function getTree() {
    if (!cachedTree) {
        cachedTree = JSON.parse(fs.readFileSync(getResourcePath('data', 'locations.json'), 'utf-8'));
    }

    await regionAvailability.ensureLoaded();
    return filterByAvailability(mergeDiscoveredLocations(cachedTree));
}

function getMapSvg() {
    if (!cachedMapSvg) {
        cachedMapSvg = fs.readFileSync(getResourcePath('icons', 'ukraine_default.svg'), 'utf-8');
    }
    return cachedMapSvg;
}

function registerRegionsIpc() {
    ipcMain.handle('regions:getTree', () => getTree());
    ipcMain.handle('regions:getMapSvg', () => getMapSvg());
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

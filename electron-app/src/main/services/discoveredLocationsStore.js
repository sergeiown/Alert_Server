const fs = require('fs');
const { getUserDataFile } = require('./appPaths');

const STORE_FILE = 'discovered_locations.json';

let store = null;

function load() {
    const filePath = getUserDataFile(STORE_FILE);
    if (!fs.existsSync(filePath)) {
        store = {};
        return store;
    }

    try {
        store = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
        store = {};
    }

    return store;
}

function ensureLoaded() {
    if (!store) load();
}

function save() {
    fs.writeFileSync(getUserDataFile(STORE_FILE), JSON.stringify(store, null, 2), 'utf-8');
}

function noteLocation(uid, info) {
    ensureLoaded();
    const key = String(uid);
    if (store[key]) return false;

    store[key] = { ...info, firstSeenAt: new Date().toISOString() };
    save();
    return true;
}

function getAll() {
    ensureLoaded();
    return store;
}

module.exports = { noteLocation, getAll };

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');

const DEBOUNCE_MS = 400;

let selectedUids = null;
let writeTimer = null;

function load() {
    const filePath = getUserDataFile('regions.json');

    if (!fs.existsSync(filePath)) {
        selectedUids = new Set();
        return selectedUids;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        selectedUids = new Set(Array.isArray(parsed.selectedUids) ? parsed.selectedUids : []);
    } catch (err) {
        selectedUids = new Set();
    }

    return selectedUids;
}

function writeNow() {
    if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
    }
    fs.writeFileSync(
        getUserDataFile('regions.json'),
        JSON.stringify({ selectedUids: Array.from(selectedUids) }, null, 2),
        'utf-8'
    );
}

function scheduleWrite() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(writeNow, DEBOUNCE_MS);
}

function ensureLoaded() {
    if (!selectedUids) load();
}

function getSelectedUids() {
    ensureLoaded();
    return Array.from(selectedUids);
}

function setSelectedUids(uids) {
    ensureLoaded();
    selectedUids = new Set(uids);
    scheduleWrite();
}

function toggleUid(uid) {
    ensureLoaded();
    if (selectedUids.has(uid)) {
        selectedUids.delete(uid);
    } else {
        selectedUids.add(uid);
    }
    scheduleWrite();
    return selectedUids.has(uid);
}

function seedFromLegacy(uids) {
    selectedUids = new Set(uids);
    writeNow();
}

function isSeeded() {
    return fs.existsSync(getUserDataFile('regions.json'));
}

module.exports = { getSelectedUids, setSelectedUids, toggleUid, seedFromLegacy, isSeeded, flush: writeNow };

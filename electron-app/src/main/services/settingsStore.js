const fs = require('fs');
const { getUserDataFile } = require('./appPaths');

const defaultSettings = {
    language: 'Ukrainian',
    trayMonoIcon: false,
    alertSound: true,
};

let settings = null;

function load() {
    const filePath = getUserDataFile('settings.json');

    if (!fs.existsSync(filePath)) {
        settings = { ...defaultSettings };
        save();
        return settings;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        settings = { ...defaultSettings, ...parsed };
    } catch (err) {
        settings = { ...defaultSettings };
        save();
    }

    return settings;
}

function save() {
    fs.writeFileSync(getUserDataFile('settings.json'), JSON.stringify(settings, null, 2), 'utf-8');
}

function getSettings() {
    if (!settings) load();
    return settings;
}

function updateSetting(key, value) {
    if (!settings) load();
    if (!defaultSettings.hasOwnProperty(key)) {
        throw new Error(`Key "${key}" does not exist in the settings.`);
    }
    settings[key] = value;
    save();
}

module.exports = { getSettings, updateSetting };

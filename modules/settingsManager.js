/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs');
const path = require('path');

const settingsFilePath = path.join(process.cwd(), 'settings.json');

// Default settings
const defaultSettings = {
    language: 'English',
    trayMonoIcon: false,
    alertSound: true,
    alertActive: 0,
};

function loadSettings() {
    if (!fs.existsSync(settingsFilePath)) {
        saveSettings(defaultSettings);
        return defaultSettings;
    }

    try {
        const data = fs.readFileSync(settingsFilePath, 'utf-8');
        const parsedSettings = JSON.parse(data);

        return { ...defaultSettings, ...parsedSettings };
    } catch (err) {
        console.error('Error reading or parsing settings file:', err);
        saveSettings(defaultSettings);

        return defaultSettings;
    }
}

function saveSettings(settings) {
    const completeSettings = { ...defaultSettings, ...settings };

    try {
        fs.writeFileSync(settingsFilePath, JSON.stringify(completeSettings, null, 2), 'utf-8');
    } catch (err) {
        console.error('Error writing settings file:', err);
    }
}

let settings = loadSettings();

function getSettings() {
    return settings;
}

function updateSetting(key, value) {
    if (defaultSettings.hasOwnProperty(key)) {
        settings[key] = value;
        saveSettings(settings);
    } else {
        console.error(`Key "${key}" does not exist in the settings.`);
    }
}

module.exports = {
    getSettings,
    updateSetting,
};

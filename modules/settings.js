/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs');
const path = require('path');

const settingsFilePath = path.join(process.cwd(), 'settings.json');

// Default settings
const defaultSettings = {
    language: 'English',
    runOnStartup: true,
    trayMonoIcon: false,
    alertSound: true,
    alertActive: 0,
};

// Function to load settings from the file or create a new one with default settings
function loadSettings() {
    if (!fs.existsSync(settingsFilePath)) {
        saveSettings(defaultSettings);
        return defaultSettings;
    }

    try {
        // Read and parse settings from the file
        const data = fs.readFileSync(settingsFilePath, 'utf-8');
        const parsedSettings = JSON.parse(data);

        // Merge loaded settings with default settings to ensure all keys exist
        return { ...defaultSettings, ...parsedSettings };
    } catch (err) {
        console.error('Error reading or parsing settings file:', err);
        // If there is an error, reset to default settings
        saveSettings(defaultSettings);
        return defaultSettings;
    }
}

// Function to save settings to the file
function saveSettings(settings) {
    // Ensure all default keys are present before saving
    const completeSettings = { ...defaultSettings, ...settings };

    try {
        fs.writeFileSync(settingsFilePath, JSON.stringify(completeSettings, null, 2), 'utf-8');
    } catch (err) {
        console.error('Error writing settings file:', err);
    }
}

// Object that stores the current settings
let settings = loadSettings();

// Function to get the current settings
function getSettings() {
    return settings;
}

// Function to update a specific setting and save the changes
function updateSetting(key, value) {
    if (defaultSettings.hasOwnProperty(key)) {
        // Update the value only if the key exists in the default settings
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

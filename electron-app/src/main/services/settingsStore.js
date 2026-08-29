// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');

const defaultSettings = {
    language: 'English',
    theme: 'system',
    visualNotificationsEnabled: true,
    activeAlertNotifyEnabled: true,
    showLiveMapOnAlert: false,
    alertSoundMode: 'siren',
    alertSoundCount: 1,
    forecastNotifyEnabled: true,
    forecastNotifyLookaheadMinutes: 120,
    massAttackThreshold: 75,
    updateCheckIntervalHours: 24,
    // 'alerts.in.ua' is the primary source (community-level granularity, weapon-type tagging).
    // 'neptun' is a token-free alternative with only oblast/raion-level granularity and no
    // weapon-type data - a real fallback for when alerts.in.ua itself is unreachable, not a
    // like-for-like replacement, hence defaulting to the richer source.
    alertSourceProvider: 'alerts.in.ua',
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

        if (!parsed.hasOwnProperty('alertSoundMode') && parsed.hasOwnProperty('alertSound')) {
            settings.alertSoundMode = parsed.alertSound ? 'siren' : 'none';
        }
        delete settings.alertSound;

        // The valid range moved from 5-60 to 50-100 - clamp a value saved under the old range
        // instead of leaving it silently out of bounds until the user next touches the field.
        settings.massAttackThreshold = Math.max(50, Math.min(100, settings.massAttackThreshold));
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

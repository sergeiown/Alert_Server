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
    // 'ukrainealarm' is the primary source (community-level granularity like alerts.in.ua, plus
    // native English region names and a richer alert-type set). 'alerts.in.ua' and 'neptun' are
    // automatic fallbacks (alertSourceManager.js) if the preferred source's polls start failing -
    // 'neptun' has only oblast/raion-level granularity and no weapon-type data, the last resort of
    // the three. This is a preferred/primary choice, not an exclusive one: whichever source is
    // actually active can differ from this during a failover.
    alertSourceProvider: 'ukrainealarm',
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

        // One-time migration for installs updating from before UkraineAlarm existed: 'alerts.in.ua'
        // was the ONLY default back then, so this can't tell a genuine past choice apart from
        // never having touched the setting - but since it only fires while the stored value is
        // still exactly the old default, it's self-limiting (never re-fires once migrated, and
        // never touches a real deliberate switch to 'neptun').
        if (parsed.alertSourceProvider === 'alerts.in.ua') {
            settings.alertSourceProvider = 'ukrainealarm';
        }
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

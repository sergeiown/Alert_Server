// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');
const notifyProfile = require('./notifyProfile');

const defaultSettings = {
    language: 'English',
    theme: 'system',
    visualNotificationsEnabled: true,
    activeAlertNotifyEnabled: true,
    alertLevelChangeNotifyEnabled: true,
    notifyProfile: notifyProfile.normalize(),
    alertSoundMode: 'siren',
    alertSoundCount: 1,
    forecastNotifyEnabled: true,
    forecastNotifyLookaheadMinutes: 120,
    updateCheckIntervalHours: 1,
    updateIntervalMigrated: false,
    minimizeToTrayOnClose: true,
    showHubOnStartup: true,
};

let settings = null;
let isFirstRun = false;

function load() {
    const filePath = getUserDataFile('settings.json');

    if (!fs.existsSync(filePath)) {
        isFirstRun = true;
        settings = { ...defaultSettings, updateIntervalMigrated: true };
        save();
        return settings;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        settings = { ...defaultSettings, ...parsed };
        settings.alertSoundCount = Math.max(1, Math.min(2, Number(settings.alertSoundCount) || 1));

        if (!parsed.hasOwnProperty('alertSoundMode') && parsed.hasOwnProperty('alertSound')) {
            settings.alertSoundMode = parsed.alertSound ? 'siren' : 'none';
        }
        delete settings.alertSound;

        if (parsed.hasOwnProperty('alertSourceProvider') || parsed.hasOwnProperty('alertSourceMigratedToAlertsInUa')) {
            delete settings.alertSourceProvider;
            delete settings.alertSourceMigratedToAlertsInUa;
            save();
        }

        if (!parsed.updateIntervalMigrated) {
            if (parsed.updateCheckIntervalHours === undefined || parsed.updateCheckIntervalHours === 24) settings.updateCheckIntervalHours = 1;
            settings.updateIntervalMigrated = true;
            save();
        }
        settings.updateCheckIntervalHours = Math.max(1, Math.min(24, Math.round(Number(settings.updateCheckIntervalHours)) || 1));

        delete settings.massAttackThreshold;
        delete settings.showLiveMapOnAlert;
        delete settings.emergencyNotifyMode;
        settings.notifyProfile = notifyProfile.normalize(settings.notifyProfile);
    } catch (err) {
        settings = { ...defaultSettings, updateIntervalMigrated: true };
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

function wasFirstRun() {
    if (!settings) load();
    return isFirstRun;
}

function updateSetting(key, value) {
    if (!settings) load();
    if (!defaultSettings.hasOwnProperty(key)) {
        throw new Error(`Key "${key}" does not exist in the settings.`);
    }
    settings[key] = key === 'notifyProfile' ? notifyProfile.normalize(value) : value;
    save();
}

module.exports = { getSettings, updateSetting, wasFirstRun };

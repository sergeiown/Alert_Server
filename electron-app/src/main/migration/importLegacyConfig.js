// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const path = require('path');

function collectSelectedUids(locationsData) {
    const uids = [];

    locationsData.states.forEach((state) => {
        if (state.usage === 1) uids.push(state.uid);

        state.districts.forEach((district) => {
            if (district.usage === 1) uids.push(district.uid);

            district.communities.forEach((community) => {
                if (community.usage === 1) uids.push(community.uid);
            });
        });
    });

    return uids;
}

// "м. Київ" state-level uid in locations.json - the default single region for a genuinely fresh
// install (no legacy config to migrate from), so the app has something meaningful to watch out of
// the box instead of silently monitoring nothing until the user opens Settings.
const DEFAULT_FRESH_INSTALL_UID = 31;

function importLegacyConfig(oldDir, { settingsStore, regionsStore }) {
    if (regionsStore.isSeeded()) {
        return { imported: false, reason: 'already-seeded' };
    }

    const locationPath = path.join(oldDir, 'location.json');
    const settingsPath = path.join(oldDir, 'settings.json');

    let uids = [DEFAULT_FRESH_INSTALL_UID];
    if (fs.existsSync(locationPath)) {
        const data = JSON.parse(fs.readFileSync(locationPath, 'utf-8'));
        uids = collectSelectedUids(data);
    }
    regionsStore.seedFromLegacy(uids);

    if (fs.existsSync(settingsPath)) {
        const oldSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (oldSettings.language) settingsStore.updateSetting('language', oldSettings.language);
        if (typeof oldSettings.alertSound === 'boolean') {
            settingsStore.updateSetting('alertSound', oldSettings.alertSound);
        }
    }

    return { imported: true, count: uids.length };
}

module.exports = { importLegacyConfig, collectSelectedUids };

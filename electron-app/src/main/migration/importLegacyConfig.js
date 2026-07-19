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

function importLegacyConfig(oldDir, { settingsStore, regionsStore }) {
    if (regionsStore.isSeeded()) {
        return { imported: false, reason: 'already-seeded' };
    }

    const locationPath = path.join(oldDir, 'location.json');
    const settingsPath = path.join(oldDir, 'settings.json');

    let uids = [];
    if (fs.existsSync(locationPath)) {
        const data = JSON.parse(fs.readFileSync(locationPath, 'utf-8'));
        uids = collectSelectedUids(data);
    }
    regionsStore.seedFromLegacy(uids);

    if (fs.existsSync(settingsPath)) {
        const oldSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (oldSettings.language) settingsStore.updateSetting('language', oldSettings.language);
        if (typeof oldSettings.trayMonoIcon === 'boolean') {
            settingsStore.updateSetting('trayMonoIcon', oldSettings.trayMonoIcon);
        }
        if (typeof oldSettings.alertSound === 'boolean') {
            settingsStore.updateSetting('alertSound', oldSettings.alertSound);
        }
    }

    return { imported: true, count: uids.length };
}

module.exports = { importLegacyConfig, collectSelectedUids };

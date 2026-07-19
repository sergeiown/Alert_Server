const fs = require('fs');
const { getResourcePath } = require('./appPaths');
const regionsStore = require('./regionsStore');

let locationLookup = null;

function buildLookup() {
    const tree = JSON.parse(fs.readFileSync(getResourcePath('data', 'locations.json'), 'utf-8'));
    const lookup = new Map();

    tree.states.forEach((state) => {
        lookup.set(String(state.uid), { type: 'state', lat: state.stateNameLat });

        state.districts.forEach((district) => {
            lookup.set(String(district.uid), { type: 'district', lat: district.districtNameLat });

            district.communities.forEach((community) => {
                lookup.set(String(community.uid), { type: 'community', lat: community.communityNameLat });
            });
        });
    });

    return lookup;
}

function getLocationLookup() {
    if (!locationLookup) locationLookup = buildLookup();
    return locationLookup;
}

function filterAlerts(alertData) {
    const selectedUids = new Set(regionsStore.getSelectedUids().map(String));
    const lookup = getLocationLookup();

    return alertData.alerts
        .filter((alert) => selectedUids.has(String(alert.location_uid)))
        .map((alert) => {
            const info = lookup.get(String(alert.location_uid));
            return { ...alert, location_lat: info ? info.lat : null };
        });
}

module.exports = { filterAlerts };

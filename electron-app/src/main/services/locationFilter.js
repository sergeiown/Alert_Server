const fs = require('fs');
const { getResourcePath } = require('./appPaths');
const regionsStore = require('./regionsStore');
const discoveredLocationsStore = require('./discoveredLocationsStore');
const { logEvent } = require('./logger');

let staticLookup = null;
let stateNameToUid = null;

function buildStaticLookup() {
    const tree = JSON.parse(fs.readFileSync(getResourcePath('data', 'locations.json'), 'utf-8'));
    const lookup = new Map();
    const nameToUid = new Map();

    tree.states.forEach((state) => {
        nameToUid.set(state.stateName, state.uid);
        lookup.set(String(state.uid), {
            type: 'state',
            name: state.stateName,
            lat: state.stateNameLat,
            stateUid: state.uid,
        });

        state.districts.forEach((district) => {
            lookup.set(String(district.uid), {
                type: 'district',
                name: district.districtName,
                lat: district.districtNameLat,
                stateUid: state.uid,
            });

            district.communities.forEach((community) => {
                lookup.set(String(community.uid), {
                    type: 'community',
                    name: community.communityName,
                    lat: community.communityNameLat,
                    stateUid: state.uid,
                });
            });
        });
    });

    stateNameToUid = nameToUid;
    return lookup;
}

function getLocationLookup() {
    if (!staticLookup) staticLookup = buildStaticLookup();

    const discovered = discoveredLocationsStore.getAll();
    const discoveredUids = Object.keys(discovered);
    if (!discoveredUids.length) return staticLookup;

    const merged = new Map(staticLookup);
    discoveredUids.forEach((uid) => {
        if (merged.has(uid)) return;
        const info = discovered[uid];
        merged.set(uid, {
            type: info.type || 'city',
            name: info.title,
            lat: info.title,
            stateUid: stateNameToUid.get(info.oblast),
        });
    });

    return merged;
}

function getHistoryFetchTarget(uid) {
    const info = getLocationLookup().get(String(uid));
    if (!info || !info.stateUid) return null;
    return { stateUid: info.stateUid, matchUid: uid };
}

function discoverUnknownLocations(alerts) {
    const lookup = getLocationLookup();

    alerts.forEach((alert) => {
        const uid = String(alert.location_uid);
        if (lookup.has(uid)) return;

        const noted = discoveredLocationsStore.noteLocation(uid, {
            title: alert.location_title,
            oblast: alert.location_oblast,
            type: alert.location_type,
        });

        if (noted) {
            logEvent(
                `Discovered a location not in locations.json: uid=${uid} "${alert.location_title}" (${alert.location_type}, ${alert.location_oblast})`
            );
        }
    });
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

module.exports = { filterAlerts, getLocationLookup, discoverUnknownLocations, getHistoryFetchTarget };

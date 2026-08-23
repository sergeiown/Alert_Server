// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { getLocationLookup } = require('./locationFilter');

function upsertEarliest(map, name, startedAt) {
    const existing = map.get(name);
    if (!existing || new Date(startedAt) < new Date(existing)) {
        map.set(name, startedAt);
    }
}

// A community/city-level alert has no polygon of its own on the map, so it's attributed to its
// parent raion instead of being dropped.
function computeAlertedRegions(alerts) {
    const lookup = getLocationLookup();
    const oblasts = new Map();
    const raions = new Map();

    alerts.forEach((alert) => {
        const info = lookup.get(String(alert.location_uid));
        if (!info) return;

        if (info.type === 'state') {
            upsertEarliest(oblasts, info.name, alert.started_at);
        } else if (info.type === 'district') {
            upsertEarliest(raions, info.name, alert.started_at);
        } else if (info.districtUid !== undefined) {
            const districtInfo = lookup.get(String(info.districtUid));
            if (districtInfo) upsertEarliest(raions, districtInfo.name, alert.started_at);
        }
    });

    return {
        oblasts: Array.from(oblasts, ([name, startedAt]) => ({ name, startedAt })),
        raions: Array.from(raions, ([name, startedAt]) => ({ name, startedAt })),
    };
}

module.exports = { computeAlertedRegions };

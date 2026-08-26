// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { getLocationLookup } = require('./locationFilter');

// Keeps the earliest-starting alert for a region, type included - a region can have more than one
// alert active at once (e.g. air raid and artillery), but the map only shows one.
function upsertEarliest(map, name, startedAt, alertType) {
    const existing = map.get(name);
    if (!existing || new Date(startedAt) < new Date(existing.startedAt)) {
        map.set(name, { startedAt, alertType });
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
            upsertEarliest(oblasts, info.name, alert.started_at, alert.alert_type);
        } else if (info.type === 'district') {
            upsertEarliest(raions, info.name, alert.started_at, alert.alert_type);
        } else if (info.districtUid !== undefined) {
            const districtInfo = lookup.get(String(info.districtUid));
            if (districtInfo) upsertEarliest(raions, districtInfo.name, alert.started_at, alert.alert_type);
        }
    });

    return {
        oblasts: Array.from(oblasts, ([name, v]) => ({ name, startedAt: v.startedAt, alertType: v.alertType })),
        raions: Array.from(raions, ([name, v]) => ({ name, startedAt: v.startedAt, alertType: v.alertType })),
    };
}

module.exports = { computeAlertedRegions };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { getLocationLookup } = require('./locationFilter');

// "red" outranks "yellow" outranks no level reported at all - used so a region with more than one
// concurrent alert (e.g. a yellow drone alert plus a red missile alert, filed as two separate
// records) shows its worst level rather than whichever one happened to start earliest.
function levelRank(level) {
    if (level === 'red') return 2;
    if (level === 'yellow') return 1;
    return 0;
}

// Keeps the earliest-starting alert's type for a region (a region can have more than one alert
// active at once, but the map only draws one), while separately tracking the WORST alert_level
// seen across all of them - the two can come from different records entirely.
function upsertEarliest(map, name, alert) {
    const existing = map.get(name);
    const worstLevel = existing && levelRank(existing.alertLevel) > levelRank(alert.alert_level) ? existing.alertLevel : alert.alert_level;

    if (!existing || new Date(alert.started_at) < new Date(existing.startedAt)) {
        map.set(name, { startedAt: alert.started_at, alertType: alert.alert_type, alertLevel: worstLevel });
    } else {
        map.set(name, { ...existing, alertLevel: worstLevel });
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
            upsertEarliest(oblasts, info.name, alert);
        } else if (info.type === 'district') {
            upsertEarliest(raions, info.name, alert);
        } else if (info.districtUid !== undefined) {
            const districtInfo = lookup.get(String(info.districtUid));
            if (districtInfo) upsertEarliest(raions, districtInfo.name, alert);
        }
    });

    return {
        oblasts: Array.from(oblasts, ([name, v]) => ({ name, startedAt: v.startedAt, alertType: v.alertType, alertLevel: v.alertLevel })),
        raions: Array.from(raions, ([name, v]) => ({ name, startedAt: v.startedAt, alertType: v.alertType, alertLevel: v.alertLevel })),
    };
}

// Kyiv (location_uid 31 in all three live sources - alerts.in.ua/UkraineAlarm/Neptun all happen to
// agree on this uid) is the one place in the country where a district-level breakdown exists only
// as free text inside threats[].source_message ("Ракетна загроза (червоний рівень) Дарницький
// район") rather than as its own separately matchable location_uid the way every other raion has -
// see alertLevels.js's describeThreats for the same text shape parsed for display elsewhere. This
// is purely for the live map's Kyiv view; it has no bearing on alerting/notifications, which stay
// anchored to the whole city record exactly as before.
const KYIV_CITY_UID = 31;
const THREAT_DISTRICT_PATTERN = /^.*?\)\s+(.+?)\s+район$/iu;

function computeKyivRaionStatuses(alerts) {
    const statusByDistrict = new Map();

    alerts
        .filter((alert) => Number(alert.location_uid) === KYIV_CITY_UID)
        .forEach((alert) => {
            (alert.threats || []).forEach((threat) => {
                if (!threat.source_message) return;
                const match = threat.source_message.match(THREAT_DISTRICT_PATTERN);
                if (!match) return;

                const district = match[1].trim();
                const existing = statusByDistrict.get(district);
                if (!existing || levelRank(threat.level) > levelRank(existing.alertLevel)) {
                    statusByDistrict.set(district, { alertLevel: threat.level, startedAt: threat.started_at });
                }
            });
        });

    return Array.from(statusByDistrict, ([name, v]) => ({ name, startedAt: v.startedAt, alertLevel: v.alertLevel }));
}

module.exports = { computeAlertedRegions, computeKyivRaionStatuses };

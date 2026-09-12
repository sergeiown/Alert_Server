// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { getLocationLookup } = require('./locationFilter');

function levelRank(level) {
    if (level === 'red') return 2;
    if (level === 'yellow') return 1;
    return 0;
}

function upsertEarliest(map, name, alert, isDirect) {
    const existing = map.get(name);
    const worstLevel = existing && levelRank(existing.alertLevel) > levelRank(alert.alert_level) ? existing.alertLevel : alert.alert_level;
    const directByLevel = existing ? new Map(existing.directByLevel) : new Map();
    if (isDirect && alert.alert_level && !directByLevel.has(alert.alert_level)) {
        directByLevel.set(alert.alert_level, alert.alert_type);
    }

    if (!existing || new Date(alert.started_at) < new Date(existing.startedAt)) {
        map.set(name, { startedAt: alert.started_at, alertType: alert.alert_type, alertLevel: worstLevel, directByLevel });
    } else {
        map.set(name, { ...existing, alertLevel: worstLevel, directByLevel });
    }
}

function directThreats(directByLevel) {
    return Array.from(directByLevel, ([level, alertType]) => ({ level, alertType })).sort(
        (a, b) => levelRank(b.level) - levelRank(a.level)
    );
}

function computeAlertedRegions(alerts) {
    const lookup = getLocationLookup();
    const oblasts = new Map();
    const raions = new Map();

    alerts.forEach((alert) => {
        const info = lookup.get(String(alert.location_uid));
        if (!info) return;

        if (info.type === 'state') {
            upsertEarliest(oblasts, info.name, alert, true);
        } else if (info.type === 'district') {
            upsertEarliest(raions, info.name, alert, true);
        } else if (info.districtUid !== undefined) {
            const districtInfo = lookup.get(String(info.districtUid));
            if (districtInfo) upsertEarliest(raions, districtInfo.name, alert, false);
        }
    });

    return {
        oblasts: Array.from(oblasts, ([name, v]) => ({
            name,
            startedAt: v.startedAt,
            alertType: v.alertType,
            alertLevel: v.alertLevel,
            hasBothLevels: v.directByLevel.size > 1,
            threats: directThreats(v.directByLevel),
        })),
        raions: Array.from(raions, ([name, v]) => ({
            name,
            startedAt: v.startedAt,
            alertType: v.alertType,
            alertLevel: v.alertLevel,
            hasBothLevels: v.directByLevel.size > 1,
            threats: directThreats(v.directByLevel),
        })),
    };
}

const KYIV_CITY_UID = 31;

const THREAT_DISTRICT_PATTERN = /^(.*?\))\s+(.+?)\s+район$/iu;

const DESCRIPTION_LEVEL_SUFFIX_PATTERN = /\s*\([^)]*\)\s*$/u;

function computeKyivRaionStatuses(alerts) {
    const statusByDistrict = new Map();

    alerts
        .filter((alert) => Number(alert.location_uid) === KYIV_CITY_UID)
        .forEach((alert) => {
            (alert.threats || []).forEach((threat) => {
                if (!threat.source_message) return;
                const match = threat.source_message.match(THREAT_DISTRICT_PATTERN);
                if (!match) return;

                const description = match[1].replace(DESCRIPTION_LEVEL_SUFFIX_PATTERN, '').trim();
                const district = match[2].trim();
                if (!statusByDistrict.has(district)) {
                    statusByDistrict.set(district, { startedAt: threat.started_at, levels: new Set(), descriptionByLevel: new Map() });
                }
                const entry = statusByDistrict.get(district);
                entry.levels.add(threat.level);

                if (!entry.descriptionByLevel.has(threat.level)) entry.descriptionByLevel.set(threat.level, description);
                if (new Date(threat.started_at) < new Date(entry.startedAt)) entry.startedAt = threat.started_at;
            });
        });

    return Array.from(statusByDistrict, ([name, v]) => {
        const levels = [...v.levels];
        const worstLevel = levels.reduce((worst, level) => (levelRank(level) > levelRank(worst) ? level : worst), null);

        const threats = [...v.descriptionByLevel.entries()]
            .sort(([levelA], [levelB]) => levelRank(levelB) - levelRank(levelA))
            .map(([level, description]) => ({ level, description }));
        return { name, startedAt: v.startedAt, alertLevel: worstLevel, hasBothLevels: levels.length > 1, threats };
    });
}

module.exports = { computeAlertedRegions, computeKyivRaionStatuses, KYIV_CITY_UID };

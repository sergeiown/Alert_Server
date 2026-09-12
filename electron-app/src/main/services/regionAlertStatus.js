// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { getLocationLookup } = require('./locationFilter');

function levelRank(level) {
    if (level === 'red') return 2;
    if (level === 'yellow') return 1;
    return 0;
}

function upsertEarliest(map, name, alert) {
    const existing = map.get(name);
    const levels = existing ? new Set(existing.levels) : new Set();
    if (alert.alert_level) levels.add(alert.alert_level);
    const worstLevel = [...levels].reduce((worst, level) => (levelRank(level) > levelRank(worst) ? level : worst), null);

    if (!existing || new Date(alert.started_at) < new Date(existing.startedAt)) {
        map.set(name, { startedAt: alert.started_at, alertType: alert.alert_type, alertLevel: worstLevel, levels });
    } else {
        map.set(name, { ...existing, alertLevel: worstLevel, levels });
    }
}

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
        oblasts: Array.from(oblasts, ([name, v]) => ({
            name,
            startedAt: v.startedAt,
            alertType: v.alertType,
            alertLevel: v.alertLevel,
            hasBothLevels: v.levels.size > 1,
        })),
        raions: Array.from(raions, ([name, v]) => ({
            name,
            startedAt: v.startedAt,
            alertType: v.alertType,
            alertLevel: v.alertLevel,
            hasBothLevels: v.levels.size > 1,
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

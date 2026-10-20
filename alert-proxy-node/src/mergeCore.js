// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const lib = require('./lib');

const DEFAULTS = {
    iaFreshMs: 90 * 1000,
    uaFreshMs: 150 * 1000,
    npFreshMs: 120 * 1000,
    freezeMaxMs: 30 * 60 * 1000,
    clearConfirmMs: 15 * 1000,
    stuckMs: 15 * 60 * 1000,
    uaStaleAlertMs: 24 * 60 * 60 * 1000,
};

const ENV_NAMES = {
    iaFreshMs: 'MERGE_IA_FRESH_MS',
    uaFreshMs: 'MERGE_UA_FRESH_MS',
    npFreshMs: 'MERGE_NP_FRESH_MS',
    freezeMaxMs: 'MERGE_FREEZE_MAX_MS',
    clearConfirmMs: 'MERGE_CLEAR_CONFIRM_MS',
    stuckMs: 'MERGE_STUCK_MS',
    uaStaleAlertMs: 'MERGE_UA_STALE_ALERT_MS',
};

const DISTRICT_ALIASES = { 'Дніпропетровська область|Самарівський район': '43' };

const LOCATION_TYPE_NAMES = { state: 'oblast', district: 'raion', community: 'hromada' };

const LEVEL_RANK = { red: 2, yellow: 1 };

function loadConfig(env = process.env) {
    const cfg = {};
    Object.keys(DEFAULTS).forEach((key) => {
        const raw = env[ENV_NAMES[key]];
        const value = raw === undefined || raw === '' ? NaN : Number(raw);
        cfg[key] = Number.isFinite(value) && value >= 0 ? value : DEFAULTS[key];
    });
    return cfg;
}

function buildDirectory(tree) {
    const byUid = new Map();
    const stateByName = new Map();
    const districtByKey = new Map();
    const descendants = new Map();

    tree.states.forEach((state) => {
        const stateUid = String(state.uid);
        byUid.set(stateUid, { uid: stateUid, type: 'state', name: state.stateName, stateName: state.stateName, parents: [] });
        stateByName.set(state.stateName, stateUid);
        const stateDescendants = [];

        (state.districts || []).forEach((district) => {
            const districtUid = String(district.uid);
            byUid.set(districtUid, {
                uid: districtUid,
                type: 'district',
                name: district.districtName,
                stateName: state.stateName,
                parents: [stateUid],
            });
            districtByKey.set(`${state.stateName}|${district.districtName}`, districtUid);
            stateDescendants.push(districtUid);
            const districtDescendants = [];

            (district.communities || []).forEach((community) => {
                const communityUid = String(community.uid);
                byUid.set(communityUid, {
                    uid: communityUid,
                    type: 'community',
                    name: community.communityName,
                    stateName: state.stateName,
                    parents: [districtUid, stateUid],
                });
                districtDescendants.push(communityUid);
                stateDescendants.push(communityUid);
            });

            descendants.set(districtUid, districtDescendants);
        });

        descendants.set(stateUid, stateDescendants);
    });

    Object.entries(DISTRICT_ALIASES).forEach(([key, uid]) => {
        if (byUid.has(uid) && !districtByKey.has(key)) districtByKey.set(key, uid);
    });

    return { byUid, stateByName, districtByKey, descendants };
}

function worseLevel(current, candidate) {
    return (LEVEL_RANK[candidate] || 0) > (LEVEL_RANK[current] || 0) ? candidate : current;
}

function createMerger({ cfg = loadConfig(), directory, log = () => {} }) {
    const shown = new Map();
    const uaOnlySince = new Map();
    const stuckLogged = new Set();

    function sourceState(fetchedAt, freshMs, now) {
        if (!fetchedAt) return { state: 'down', ageMs: null };
        const ageMs = Math.max(0, now - fetchedAt);
        if (ageMs <= freshMs) return { state: 'ok', ageMs };
        if (ageMs <= cfg.freezeMaxMs) return { state: 'stale', ageMs };
        return { state: 'down', ageMs };
    }

    function parseIa(alerts) {
        const map = new Map();
        (alerts || []).forEach((alert) => {
            if (!alert || alert.finished_at || alert.location_uid === undefined || alert.location_uid === null || !alert.alert_type) return;
            const uid = String(alert.location_uid);
            map.set(`${uid}:${alert.alert_type}`, { uid, type: alert.alert_type, alert });
        });
        return map;
    }

    function parseUa(regions, now) {
        const map = new Map();
        (regions || []).forEach((region) => {
            if (!region || lib.UKRAINEALARM_IGNORED_REGION_IDS.has(String(region.regionId))) return;
            (region.activeAlerts || []).forEach((alert) => {
                const type = lib.UKRAINEALARM_TYPE_MAP[alert.type];
                if (!type) return;
                if (now - new Date(alert.lastUpdate).getTime() > cfg.uaStaleAlertMs) return;
                const uid = String(lib.ukraineAlarmUid(region.regionId));
                map.set(`${uid}:${type}`, { uid, type, region, alert, levels: alert.activeAlertLevels || [] });
            });
        });
        return map;
    }

    function parseNp(payload) {
        const map = new Map();
        if (!payload) return map;
        (payload.oblasts || []).forEach((item) => {
            const uid = directory.stateByName.get(item.name);
            if (uid) map.set(uid, { uid, name: item.name, level: item.level || null, since: item.since, reasons: item.reasons || [], scope: 'state' });
        });
        (payload.raions || []).forEach((item) => {
            const uid = directory.districtByKey.get(`${item.oblast}|${item.name}`);
            if (uid) map.set(uid, { uid, name: item.name, level: item.level || null, since: item.since, reasons: item.reasons || [], scope: 'district' });
        });
        return map;
    }

    function typeUidsOf(entries) {
        const index = new Map();
        for (const entry of entries) {
            if (!index.has(entry.type)) index.set(entry.type, new Set());
            index.get(entry.type).add(entry.uid);
        }
        return index;
    }

    function isCovered(index, uid, type) {
        const set = index.get(type);
        if (!set) return false;
        if (set.has(uid)) return true;
        const info = directory.byUid.get(uid);
        if (info && info.parents.some((parent) => set.has(parent))) return true;
        const below = directory.descendants.get(uid);
        return Boolean(below && below.some((child) => set.has(child)));
    }

    function levelsFor(uid, type, uaMap, npMap, useUa, useNp) {
        const info = directory.byUid.get(uid);
        const tiers = [uid, ...(info ? info.parents : [])];

        for (const tier of tiers) {
            const ua = useUa ? uaMap.get(`${tier}:${type}`) : null;
            const np = useNp && type === 'air_raid' ? npMap.get(tier) : null;
            if (!ua && !np) continue;

            let level = null;
            const threats = [];
            if (ua) {
                level = worseLevel(level, lib.worstUkraineAlarmLevel(ua.levels));
                threats.push(...lib.mapUkraineAlarmThreats(ua.levels));
            }
            if (np) {
                level = worseLevel(level, np.level);
                (np.reasons || []).forEach((reason) => {
                    threats.push({ threat_type: null, level: np.level, started_at: np.since || null, source_message: reason });
                });
            }
            return { level, threats };
        }

        return { level: null, threats: [] };
    }

    function startedAtOf(entry) {
        if (entry.ia && entry.ia.alert.started_at) return entry.ia.alert.started_at;
        if (entry.ua) {
            const created = entry.ua.levels.map((level) => level.createdAt).filter(Boolean).sort();
            if (created.length) return created[0];
            if (entry.ua.alert.lastUpdate) return entry.ua.alert.lastUpdate;
        }
        if (entry.np) return entry.np.since || null;
        return null;
    }

    function describeLocation(entry) {
        const info = directory.byUid.get(entry.uid);
        const ia = entry.ia ? entry.ia.alert : null;
        const title = (ia && ia.location_title) || (entry.ua && entry.ua.region.regionName) || (entry.np && entry.np.name) || (info && info.name) || entry.uid;
        const oblast = (ia && ia.location_oblast) || (info && info.stateName) || null;
        const type = (ia && ia.location_type) || (info ? LOCATION_TYPE_NAMES[info.type] : null);
        return { title, oblast, type };
    }

    function compose(entry, uaMap, npMap, useUa, useNp) {
        const location = describeLocation(entry);
        const { level, threats } = levelsFor(entry.uid, entry.type, uaMap, npMap, useUa, useNp);
        const sources = [];
        if (entry.ia) sources.push('ia');
        if (entry.ua) sources.push('ua');
        if (entry.np || (entry.type === 'air_raid' && useNp && npMap.has(entry.uid))) sources.push('np');

        const composed = {
            id: `m-${entry.uid}-${entry.type}`,
            location_uid: entry.uid,
            location_title: location.title,
            alert_type: entry.type,
            started_at: startedAtOf(entry),
            alert_level: level,
            threats,
            sources,
        };
        if (location.oblast) composed.location_oblast = location.oblast;
        if (location.type) composed.location_type = location.type;
        if (entry.ia && entry.ia.alert.notes) composed.notes = entry.ia.alert.notes;
        return composed;
    }

    function update(now, input) {
        const iaInput = input.ia || {};
        const uaInput = input.ua || {};
        const npInput = input.np || {};

        const ia = sourceState(iaInput.fetchedAt, cfg.iaFreshMs, now);
        const ua = sourceState(uaInput.fetchedAt, cfg.uaFreshMs, now);
        const np = sourceState(npInput.fetchedAt, cfg.npFreshMs, now);

        const iaMap = ia.state === 'down' ? new Map() : parseIa(iaInput.alerts);
        const uaMapAll = ua.state === 'down' ? new Map() : parseUa(uaInput.regions, now);
        const npMap = np.state === 'down' ? new Map() : parseNp(npInput.payload);

        const iaTypeUids = typeUidsOf(iaMap.values());
        const stuck = new Set();
        uaMapAll.forEach((entry, key) => {
            if (ia.state === 'ok' && !isCovered(iaTypeUids, entry.uid, entry.type)) {
                if (!uaOnlySince.has(key)) uaOnlySince.set(key, now);
            } else {
                uaOnlySince.delete(key);
            }
        });
        [...uaOnlySince.keys()].forEach((key) => {
            if (!uaMapAll.has(key)) uaOnlySince.delete(key);
        });
        uaOnlySince.forEach((since, key) => {
            if (now - since <= cfg.stuckMs) return;
            stuck.add(key);
            if (!stuckLogged.has(key)) {
                stuckLogged.add(key);
                log(`UkraineAlarm alert ${key} is not confirmed by alerts.in.ua for over ${Math.round(cfg.stuckMs / 60000)} min, excluded as stuck`);
            }
        });
        [...stuckLogged].forEach((key) => {
            if (!stuck.has(key)) stuckLogged.delete(key);
        });

        const uaMap = new Map([...uaMapAll].filter(([key]) => !stuck.has(key)));

        const entries = new Map();
        iaMap.forEach((entry, key) => entries.set(key, { uid: entry.uid, type: entry.type, ia: entry }));
        uaMap.forEach((entry, key) => {
            if (entries.has(key)) entries.get(key).ua = entry;
            else entries.set(key, { uid: entry.uid, type: entry.type, ua: entry });
        });

        const officialDown = ia.state !== 'ok' && ua.state !== 'ok';
        if (officialDown && np.state === 'ok') {
            const covered = typeUidsOf(entries.values());
            [...npMap.values()]
                .sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'state' ? -1 : 1))
                .forEach((entry) => {
                    const key = `${entry.uid}:air_raid`;
                    if (entries.has(key) || isCovered(covered, entry.uid, 'air_raid')) return;
                    entries.set(key, { uid: entry.uid, type: 'air_raid', np: entry });
                    if (!covered.has('air_raid')) covered.set('air_raid', new Set());
                    covered.get('air_raid').add(entry.uid);
                });
        }

        const useUa = ua.state !== 'down';
        const useNp = np.state !== 'down';
        const present = new Map();
        entries.forEach((entry, key) => present.set(key, compose(entry, uaMap, npMap, useUa, useNp)));

        present.forEach((alert, key) => shown.set(key, { alert, lastSeenAt: now }));
        [...shown.keys()].forEach((key) => {
            if (present.has(key)) return;
            if (now - shown.get(key).lastSeenAt >= cfg.clearConfirmMs) shown.delete(key);
        });

        const alerts = [...shown.values()]
            .map((item) => item.alert)
            .sort((a, b) => Number(a.location_uid) - Number(b.location_uid) || (a.alert_type < b.alert_type ? -1 : 1));

        const officialEntries = [...entries.values()].filter((entry) => entry.ia || entry.ua);
        const officialAirRaid = typeUidsOf(officialEntries);
        const neptunOnly = [...npMap.values()]
            .filter((entry) => !isCovered(officialAirRaid, entry.uid, 'air_raid'))
            .map((entry) => ({ location_uid: entry.uid, title: entry.name, level: entry.level, since: entry.since || null }))
            .sort((a, b) => Number(a.location_uid) - Number(b.location_uid));

        const uaTypeUids = typeUidsOf(uaMap.values());
        const iaOnlyKeys =
            ia.state === 'ok' && ua.state === 'ok'
                ? [...iaMap.entries()].filter(([, entry]) => !isCovered(uaTypeUids, entry.uid, entry.type)).map(([key]) => key)
                : [];

        const officialCount = alerts.filter((alert) => alert.sources.includes('ia') || alert.sources.includes('ua')).length;

        return {
            ready: !(ia.state === 'down' && ua.state === 'down'),
            alerts,
            officialCount,
            sources: {
                ia: { state: ia.state, ageMs: ia.ageMs },
                ua: { state: ua.state, ageMs: ua.ageMs, webhook: input.webhook || 'healthy' },
                np: { state: np.state, ageMs: np.ageMs },
            },
            degraded: ia.state !== 'ok' || ua.state !== 'ok' || np.state !== 'ok',
            neptunOnly,
            iaOnlyKeys,
        };
    }

    return { update };
}

function signatureOf(result) {
    return JSON.stringify({
        alerts: result.alerts,
        states: [result.sources.ia.state, result.sources.ua.state, result.sources.ua.webhook, result.sources.np.state],
        degraded: result.degraded,
        neptunOnly: result.neptunOnly,
    });
}

module.exports = { loadConfig, buildDirectory, createMerger, signatureOf, DEFAULTS };

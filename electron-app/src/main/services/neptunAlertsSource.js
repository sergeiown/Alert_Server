// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');
const { setLatestAlertData, getLatestAlertData } = require('./activeAlertData');
const regionsStore = require('./regionsStore');
const { getLocationLookup } = require('./locationFilter');

const ALERTS_URL = 'https://neptun.in.ua/api/v1/alerts';
const POLL_INTERVAL_MS = 30000;
const UNMATCHED_LOG_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const CRIMEA_RAW_NAME = 'Aвmoнoмнa Pecпублiкa Kpuм';
const CRIMEA_NEPTUN_NAME = 'Автономна Республіка Крим';

const SEVASTOPOL_RAW_NAME = 'м. Ceвacmoпoль';
const SEVASTOPOL_NEPTUN_NAME = 'Севастополь';

let stateByName = null;
let districtByName = null;
const loggedUnmatchedAt = new Map();

function buildLookups() {
    const tree = JSON.parse(require('fs').readFileSync(getResourcePath('data', 'locations.json'), 'utf-8'));
    stateByName = new Map();
    districtByName = new Map();

    tree.states.forEach((state) => {
        stateByName.set(state.stateName, { uid: state.uid, stateName: state.stateName });
        if (state.stateName === CRIMEA_RAW_NAME) {
            stateByName.set(CRIMEA_NEPTUN_NAME, { uid: state.uid, stateName: state.stateName });
        }

        state.districts.forEach((district) => {
            districtByName.set(district.districtName, {
                uid: district.uid,
                stateUid: state.uid,
                stateName: state.stateName,
            });
            if (district.districtName === SEVASTOPOL_RAW_NAME) {
                districtByName.set(SEVASTOPOL_NEPTUN_NAME, {
                    uid: district.uid,
                    stateUid: state.uid,
                    stateName: state.stateName,
                });
            }
        });
    });
}

function logUnmatchedOnce(name, oblast) {
    const now = Date.now();
    const lastLogged = loggedUnmatchedAt.get(name) || 0;
    if (now - lastLogged < UNMATCHED_LOG_COOLDOWN_MS) return;
    loggedUnmatchedAt.set(name, now);
    logEvent(`Neptun alert source: no matching location in locations.json for "${name}" (${oblast})`, 'WARNING');
}

function mapNeptunThreats(entry) {
    return (entry.reasons || []).map((message) => ({
        threat_type: null,
        level: entry.level || null,
        started_at: entry.since,
        source_message: message,
    }));
}

function transformOblasts(oblasts) {
    return (oblasts || [])
        .map((entry) => {
            const state = stateByName.get(entry.name);
            if (state) {
                return {
                    id: `neptun-oblast-${entry.key}`,
                    location_uid: state.uid,
                    location_title: state.stateName,
                    location_oblast: state.stateName,
                    location_type: 'state',
                    alert_type: 'air_raid',
                    started_at: entry.since,
                    alert_level: entry.level || null,
                    threats: mapNeptunThreats(entry),
                };
            }

            const district = districtByName.get(entry.name);
            if (district) {
                return {
                    id: `neptun-oblast-${entry.key}`,
                    location_uid: district.uid,
                    location_title: entry.name,
                    location_oblast: district.stateName,
                    location_type: 'district',
                    alert_type: 'air_raid',
                    started_at: entry.since,
                    alert_level: entry.level || null,
                    threats: mapNeptunThreats(entry),
                };
            }

            logUnmatchedOnce(entry.name, entry.oblast);
            return null;
        })
        .filter(Boolean);
}

function transformRaions(raions) {
    return (raions || [])
        .map((entry) => {
            const district = districtByName.get(entry.name);
            if (!district) {
                logUnmatchedOnce(entry.name, entry.oblast);
                return null;
            }
            return {
                id: `neptun-raion-${entry.key}`,
                location_uid: district.uid,
                location_title: entry.name,
                location_oblast: district.stateName,
                location_type: 'district',
                alert_type: 'air_raid',
                started_at: entry.since,
                alert_level: entry.level || null,
                threats: mapNeptunThreats(entry),
            };
        })
        .filter(Boolean);
}

function warnAboutUncoveredMonitoredRegions() {
    const lookup = getLocationLookup();
    const uncovered = regionsStore
        .getSelectedUids()
        .map((uid) => lookup.get(String(uid)))
        .filter((info) => info && info.type === 'community')
        .map((info) => info.name);

    if (!uncovered.length) return;
    logEvent(
        `Neptun alert source: ${uncovered.length} monitored location(s) have no community-level equivalent in Neptun's data and won't be directly matched (only if their whole raion/oblast goes on alert): ${uncovered.join(', ')}`,
        'WARNING'
    );
}

async function pollOnce(onHealthChange) {
    if (!stateByName) buildLookups();

    try {
        const response = await fetch(ALERTS_URL);
        if (!response.ok) {
            logEvent(`Neptun alerts fetch failed: ${response.status}`, 'NETWORK');
            if (onHealthChange) onHealthChange(false);
            return getLatestAlertData();
        }

        const raw = await response.json();
        const alerts = [...transformOblasts(raw.oblasts), ...transformRaions(raw.raions)];
        const data = { alerts };
        setLatestAlertData(data);
        if (onHealthChange) onHealthChange(true);
        return data;
    } catch (err) {
        logEvent(`Neptun alerts request error: ${err.message}`, 'NETWORK');
        if (onHealthChange) onHealthChange(false);
        return getLatestAlertData();
    }
}

function startPolling(onUpdate, onHealthChange) {
    warnAboutUncoveredMonitoredRegions();

    const tick = async () => {
        const data = await pollOnce(onHealthChange);
        if (data) onUpdate(data);
    };

    tick();
    return setInterval(tick, POLL_INTERVAL_MS);
}

module.exports = { startPolling };

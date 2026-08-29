// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

// A token-free alternative to alertPoller.js's alerts.in.ua feed, selectable in Settings
// (settingsStore's alertSourceProvider) - not a like-for-like replacement, since Neptun only
// tracks oblast/raion-level siren status (no community-level granularity, no weapon-type
// tagging), hence alerts.in.ua staying the default. Produces the exact same alertData.alerts
// shape alertPoller.js does, so every downstream consumer (filtering, notifications, forecast,
// tray, daily stats) works unmodified regardless of which source is actually polling.

const { getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');
const { setLatestAlertData, getLatestAlertData } = require('./activeAlertData');

const ALERTS_URL = 'https://neptun.in.ua/api/v1/alerts';
const POLL_INTERVAL_MS = 30000;
const UNMATCHED_LOG_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// locations.json's own name for Crimea is this exact mixed Latin/Cyrillic string (see the same
// constant documented in renderer/liveMap/regionNameUtils.js) - Neptun's own "Автономна
// Республіка Крим" is plain Cyrillic and would never exact-match it.
const CRIMEA_RAW_NAME = 'Aвmoнoмнa Pecпублiкa Kpuм';
const CRIMEA_NEPTUN_NAME = 'Автономна Республіка Крим';

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
        });
    });
}

// Not every Neptun entry has a home in locations.json (e.g. Sevastopol has no separate entry
// there at all, folded into occupied-Crimea reporting elsewhere) - these simply aren't
// selectable in this app's own region tree, so silently skipping them is correct, not a bug to
// paper over. Logged once a day per name (not every 30-second poll) purely so it isn't a total
// mystery why a name never turns into a monitorable alert.
function logUnmatchedOnce(name, oblast) {
    const now = Date.now();
    const lastLogged = loggedUnmatchedAt.get(name) || 0;
    if (now - lastLogged < UNMATCHED_LOG_COOLDOWN_MS) return;
    loggedUnmatchedAt.set(name, now);
    logEvent(`Neptun alert source: no matching location in locations.json for "${name}" (${oblast})`, 'WARNING');
}

function transformOblasts(oblasts) {
    return (oblasts || [])
        .map((entry) => {
            const state = stateByName.get(entry.name);
            if (!state) {
                logUnmatchedOnce(entry.name, entry.oblast);
                return null;
            }
            return {
                id: `neptun-oblast-${entry.key}`,
                location_uid: state.uid,
                location_title: state.stateName,
                location_oblast: state.stateName,
                location_type: 'state',
                alert_type: 'air_raid',
                started_at: entry.since,
            };
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
            };
        })
        .filter(Boolean);
}

async function pollOnce() {
    if (!stateByName) buildLookups();

    try {
        const response = await fetch(ALERTS_URL);
        if (!response.ok) {
            logEvent(`Neptun alerts fetch failed: ${response.status}`, 'NETWORK');
            return getLatestAlertData();
        }

        const raw = await response.json();
        const alerts = [...transformOblasts(raw.oblasts), ...transformRaions(raw.raions)];
        const data = { alerts };
        setLatestAlertData(data);
        return data;
    } catch (err) {
        logEvent(`Neptun alerts request error: ${err.message}`, 'NETWORK');
        return getLatestAlertData();
    }
}

function startPolling(onUpdate) {
    const tick = async () => {
        const data = await pollOnce();
        if (data) onUpdate(data);
    };

    tick();
    return setInterval(tick, POLL_INTERVAL_MS);
}

module.exports = { startPolling };

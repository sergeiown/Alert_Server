// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { normalizeOblastName, normalizeRaionName } from './regionNameUtils.js';

const REFRESH_MS = 30000; // must match the main process poll cadence

let latest = { oblasts: [], raions: [], kyivRaions: [] };
const listeners = new Set();

async function refresh() {
    latest = await window.alertServerLiveMap.getAlertedRegions();
    listeners.forEach((fn) => fn(latest));
}

function subscribe(fn) {
    listeners.add(fn);
    fn(latest);
    return () => listeners.delete(fn);
}

function getLatest() {
    return latest;
}

function getOblastStartedAt(key) {
    const match = latest.oblasts.find((o) => normalizeOblastName(o.name) === key);
    return match ? match.startedAt : null;
}

function getRaionStartedAt(key) {
    const match = latest.raions.find((r) => normalizeRaionName(r.name) === key);
    return match ? match.startedAt : null;
}

function getOblastAlertTypeName(key) {
    const match = latest.oblasts.find((o) => normalizeOblastName(o.name) === key);
    return match ? match.alertTypeName : null;
}

function getRaionAlertTypeName(key) {
    const match = latest.raions.find((r) => normalizeRaionName(r.name) === key);
    return match ? match.alertTypeName : null;
}

function getOblastAlertLevel(key) {
    const match = latest.oblasts.find((o) => normalizeOblastName(o.name) === key);
    return match ? match.alertLevel : null;
}

function getRaionAlertLevel(key) {
    const match = latest.raions.find((r) => normalizeRaionName(r.name) === key);
    return match ? match.alertLevel : null;
}

// Kyiv's own districts, unlike every other raion in the country, have no location_uid of their own
// to key by - matched directly by the district name text KYIV_RAION_BORDERS already uses (both
// ultimately come from the same OSM-derived spelling), no normalizeRaionName involved.
function getKyivRaionStartedAt(name) {
    const match = latest.kyivRaions.find((r) => r.name === name);
    return match ? match.startedAt : null;
}

function getKyivRaionAlertLevel(name) {
    const match = latest.kyivRaions.find((r) => r.name === name);
    return match ? match.alertLevel : null;
}

// True when BOTH a red and a yellow threat are active for this district at once (e.g. a drone
// threat that a missile threat later joined) - collapsing to just the worst level would silently
// drop the fact that a lesser one is also still live there.
function getKyivRaionHasBothLevels(name) {
    const match = latest.kyivRaions.find((r) => r.name === name);
    return match ? Boolean(match.hasBothLevels) : false;
}

refresh();
setInterval(refresh, REFRESH_MS);

export {
    subscribe,
    getLatest,
    getOblastStartedAt,
    getRaionStartedAt,
    getOblastAlertTypeName,
    getRaionAlertTypeName,
    getOblastAlertLevel,
    getRaionAlertLevel,
    getKyivRaionStartedAt,
    getKyivRaionAlertLevel,
    getKyivRaionHasBothLevels,
    REFRESH_MS,
};

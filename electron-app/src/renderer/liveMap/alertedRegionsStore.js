// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { normalizeOblastName, normalizeRaionName } from './regionNameUtils.js';

const REFRESH_MS = 30000; // must match the main process poll cadence

let latest = { oblasts: [], raions: [] };
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

refresh();
setInterval(refresh, REFRESH_MS);

export { subscribe, getLatest, getOblastStartedAt, getRaionStartedAt, REFRESH_MS };

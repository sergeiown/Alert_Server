import { normalizeOblastName, normalizeRaionName } from './regionNameUtils.js';

// Shared fetch+cache for the nationwide per-region alert status, so regionStatus.js (oblast/raion
// coloring) and cityLabels.js (city click info) don't each poll the same IPC call independently.
const REFRESH_MS = 30000; // matches the main process poll cadence

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

// Convenience lookups for consumers that just want one region's status (e.g. a city's parent
// oblast when the user clicks it) without re-deriving the normalized-name Map themselves.
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

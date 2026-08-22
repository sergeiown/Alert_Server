const { logEvent } = require('./logger');

// The "cyterat/deepstate-map-data" community archive of DeepState's own occupied-territory map -
// one file per day, name-dated, updated once daily around 03:00 UTC. This is real, actively
// changing military-situation data, unlike the static administrative boundaries embedded
// elsewhere on the live map - it's fetched at runtime and never bundled with the app.
const BASE_URL = 'https://raw.githubusercontent.com/cyterat/deepstate-map-data/main/data/deepstatemap_data_';
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // the source itself only updates once a day
const MAX_LOOKBACK_DAYS = 5; // publishing can lag - give up rather than walking back forever

let cached = { geojson: null, date: null };

function formatDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

async function tryFetch(dateStr) {
    const response = await fetch(`${BASE_URL}${dateStr}.geojson`);
    if (!response.ok) return null;
    return response.json();
}

async function refresh() {
    const now = new Date();

    for (let daysBack = 0; daysBack < MAX_LOOKBACK_DAYS; daysBack++) {
        const dateStr = formatDate(new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000));
        if (cached.date === dateStr) return; // already have this day's snapshot

        try {
            const geojson = await tryFetch(dateStr);
            if (geojson) {
                cached = { geojson, date: dateStr };
                logEvent(`Occupied-territory data updated (${dateStr})`);
                return;
            }
        } catch (err) {
            logEvent(`Occupied-territory fetch failed for ${dateStr}: ${err.message}`);
        }
    }

    if (!cached.geojson) {
        logEvent('Occupied-territory data: no recent snapshot found');
    }
}

function getLatestOccupiedTerritory() {
    return cached;
}

function startOccupiedTerritoryRefresh() {
    refresh();
    setInterval(refresh, REFRESH_INTERVAL_MS);
}

module.exports = { startOccupiedTerritoryRefresh, getLatestOccupiedTerritory };

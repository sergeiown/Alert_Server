// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');

const BASE_URL = 'https://raw.githubusercontent.com/cyterat/deepstate-map-data/main/data/deepstatemap_data_';
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_LOOKBACK_DAYS = 5;

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
        if (cached.date === dateStr) return;

        try {
            const geojson = await tryFetch(dateStr);
            if (geojson) {
                cached = { geojson, date: dateStr };
                logEvent(`Occupied-territory data updated (DeepState, ${dateStr})`, 'NETWORK');
                return;
            }
        } catch (err) {
            logEvent(`Occupied-territory fetch failed for ${dateStr} (DeepState): ${err.message}`, 'NETWORK');
        }
    }

    if (!cached.geojson) {
        logEvent(`Occupied-territory data: no snapshot found on DeepState in the last ${MAX_LOOKBACK_DAYS} days`, 'WARNING');
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

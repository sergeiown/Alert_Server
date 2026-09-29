// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const { PROXY_URL, getClientVersion } = require('./proxyConfig');

const DIRECT_URL = 'https://raw.githubusercontent.com/cyterat/deepstate-map-data/main/data/deepstatemap_data_';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const MAX_LOOKBACK_DAYS = 5;

let cached = { geojson: null, date: null };

function formatDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

async function fetchFromServer() {
    const { alertProxyClientKey } = loadLocalConfig();
    if (!alertProxyClientKey) return null;

    const response = await fetch(`${PROXY_URL}/map/occupied`, {
        headers: { 'X-Client-Key': alertProxyClientKey, 'X-Client-Version': getClientVersion() },
    });
    if (!response.ok) return null;

    const date = response.headers.get('X-Data-Date');
    if (date && cached.date === date) return { geojson: cached.geojson, date };
    return { geojson: await response.json(), date };
}

async function fetchDirect() {
    const now = new Date();
    for (let daysBack = 0; daysBack < MAX_LOOKBACK_DAYS; daysBack++) {
        const dateStr = formatDate(new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000));
        const response = await fetch(`${DIRECT_URL}${dateStr}.geojson`);
        if (response.ok) return { geojson: await response.json(), date: dateStr };
    }
    return null;
}

async function refresh() {
    let result = null;
    try {
        result = await fetchFromServer();
    } catch (err) {
        logEvent(`Occupied territory fetch failed (DeepState): ${err.message}`, 'NETWORK');
    }

    if (!result) {
        try {
            result = await fetchDirect();
        } catch (err) {
            logEvent(`Occupied territory fetch failed (DeepState): ${err.message}`, 'NETWORK');
        }
    }

    if (!result || !result.geojson) {
        if (!cached.geojson) logEvent('Occupied territory: no snapshot available from DeepState', 'WARNING');
        return;
    }

    if (cached.date !== result.date) logEvent(`Occupied territory updated (DeepState): ${result.date}`, 'NETWORK');
    cached = { geojson: result.geojson, date: result.date };
}

function getLatestOccupiedTerritory() {
    return cached;
}

function startOccupiedTerritoryRefresh() {
    refresh();
    setInterval(refresh, REFRESH_INTERVAL_MS);
}

module.exports = { startOccupiedTerritoryRefresh, getLatestOccupiedTerritory };

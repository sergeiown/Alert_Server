const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');

// The Worker (alert-proxy) holds the actual Kaggle credentials server-side and does the heavy
// lifting (fetching both source CSVs, parsing, aggregating) - this only ever receives its already
// small, ready-to-render summary. Refreshed far less often than anything else this app polls: the
// underlying Kaggle dataset itself only updates weekly, and the Worker's own cache already sits at
// 24h, so checking more often than once a day would just re-fetch the same cached response.
const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

let cached = null;

async function refresh() {
    try {
        const { alertProxyClientKey } = loadLocalConfig();
        if (!alertProxyClientKey) return;

        const response = await fetch(`${PROXY_URL}/weapon-stats`, {
            headers: { 'X-Client-Key': alertProxyClientKey },
        });
        if (!response.ok) {
            logEvent(`Weapon-stats fetch failed: ${response.status}`);
            return;
        }

        cached = await response.json();
        logEvent(`Weapon-stats updated (through ${cached.dateRange?.to})`);
    } catch (err) {
        logEvent(`Weapon-stats fetch error: ${err.message}`);
    }
}

function getLatestWeaponStats() {
    return cached;
}

function startWeaponStatsRefresh() {
    refresh();
    setInterval(refresh, REFRESH_INTERVAL_MS);
}

module.exports = { startWeaponStatsRefresh, getLatestWeaponStats };

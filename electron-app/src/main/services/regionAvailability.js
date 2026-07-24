const { loadLocalConfig } = require('./localConfig');
const { logEvent } = require('./logger');

const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';

let bitmap = null;
let loadPromise = null;

async function fetchBitmap() {
    const { alertProxyClientKey } = loadLocalConfig();
    const response = await fetch(`${PROXY_URL}/region-statuses`, {
        headers: { 'X-Client-Key': alertProxyClientKey },
    });

    if (!response.ok) {
        logEvent(`Failed to fetch region availability: ${response.status}`);
        return;
    }

    const raw = await response.text();
    bitmap = JSON.parse(raw);
}

function ensureLoaded() {
    if (bitmap !== null) return Promise.resolve();
    if (!loadPromise) {
        loadPromise = fetchBitmap().catch((err) => {
            logEvent(`Region availability request error: ${err.message}`);
        });
    }
    return loadPromise;
}

function isUidAssigned(uid) {
    if (bitmap === null) return true;
    const index = Number(uid);
    if (index >= bitmap.length) return true;
    return bitmap[index] !== ' ';
}

module.exports = { ensureLoaded, isUidAssigned };

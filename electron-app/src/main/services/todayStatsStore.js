// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const { PROXY_URL, getClientVersion, proxyFetch, describeError } = require('./proxyConfig');

const CACHE_TTL_MS = 30 * 1000;
const ERROR_LOG_COOLDOWN_MS = 10 * 60 * 1000;

let cached = null;
let lastErrorLoggedAt = 0;

async function getLatestTodayStats(monitoredUids) {
    const { alertProxyClientKey } = loadLocalConfig();
    if (!alertProxyClientKey) return null;

    const uids = (monitoredUids || []).map(String).sort().join(',');
    if (cached && cached.uids === uids && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

    try {
        const response = await proxyFetch(`${PROXY_URL}/trends/today?uids=${encodeURIComponent(uids)}`, {
            headers: { 'X-Client-Key': alertProxyClientKey, 'X-Client-Version': getClientVersion() },
        });
        if (!response.ok) throw new Error(`status ${response.status}`);

        const data = await response.json();
        if (!data || typeof data.total !== 'number' || !Array.isArray(data.byHour)) throw new Error('unexpected response');

        cached = { uids, data, fetchedAt: Date.now() };
        return data;
    } catch (err) {
        const now = Date.now();
        if (now - lastErrorLoggedAt >= ERROR_LOG_COOLDOWN_MS) {
            lastErrorLoggedAt = now;
            logEvent(`Today stats fetch failed: ${describeError(err)}`, 'NETWORK');
        }
        return cached ? cached.data : null;
    }
}

module.exports = { getLatestTodayStats };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const { PROXY_URL, getClientVersion, proxyFetch, describeError } = require('./proxyConfig');

const CACHE_TTL_MS = 5 * 60 * 1000;
const ERROR_LOG_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_DAYS = 30;

const cache = new Map();
let lastErrorLoggedAt = 0;

async function getThreatTrends(days = DEFAULT_DAYS) {
    const { alertProxyClientKey } = loadLocalConfig();
    if (!alertProxyClientKey) return null;

    const cached = cache.get(days);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

    try {
        const response = await proxyFetch(`${PROXY_URL}/trends/threats?days=${days}`, {
            headers: { 'X-Client-Key': alertProxyClientKey, 'X-Client-Version': getClientVersion() },
        });
        if (!response.ok) throw new Error(`status ${response.status}`);

        const data = await response.json();
        if (!data || !data.totals || !Array.isArray(data.perDay)) throw new Error('unexpected response');

        cache.set(days, { data, fetchedAt: Date.now() });
        return data;
    } catch (err) {
        const now = Date.now();
        if (now - lastErrorLoggedAt >= ERROR_LOG_COOLDOWN_MS) {
            lastErrorLoggedAt = now;
            logEvent(`Threat trends fetch failed: ${describeError(err)}`, 'NETWORK');
        }
        return cached ? cached.data : null;
    }
}

module.exports = { getThreatTrends };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { loadLocalConfig } = require('./localConfig');
const { PROXY_URL, getClientVersion, proxyFetch } = require('./proxyConfig');

const CACHE_TTL_MS = 15 * 1000;
const EMPTY_PEAKS = { alertPeak: 0, threatPeak: 0 };

let cached = null;

async function getDailyPeaks() {
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

    try {
        const { alertProxyClientKey } = loadLocalConfig();
        if (!alertProxyClientKey) return EMPTY_PEAKS;

        const response = await proxyFetch(`${PROXY_URL}/daily-peaks`, {
            headers: { 'X-Client-Key': alertProxyClientKey, 'X-Client-Version': getClientVersion() },
        });
        if (!response.ok) throw new Error(`status ${response.status}`);

        const data = await response.json();
        const peaks = { alertPeak: Number(data.alertPeak) || 0, threatPeak: Number(data.threatPeak) || 0 };
        cached = { data: peaks, fetchedAt: Date.now() };
        return peaks;
    } catch (err) {
        return cached ? cached.data : EMPTY_PEAKS;
    }
}

module.exports = { getDailyPeaks };

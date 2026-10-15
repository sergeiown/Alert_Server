// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { loadLocalConfig } = require('./localConfig');
const { PROXY_URL, getClientVersion, proxyFetch } = require('./proxyConfig');

const SILENT_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const POLICY_TIMEOUT_MS = 8000;

function compareVersions(a, b) {
    const left = String(a).split('.').map((part) => parseInt(part, 10) || 0);
    const right = String(b).split('.').map((part) => parseInt(part, 10) || 0);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const difference = (left[i] || 0) - (right[i] || 0);
        if (difference !== 0) return difference < 0 ? -1 : 1;
    }
    return 0;
}

async function fetchPolicy() {
    try {
        const { alertProxyClientKey } = loadLocalConfig();
        if (!alertProxyClientKey) return null;

        const response = await proxyFetch(`${PROXY_URL}/client-policy`, {
            headers: { 'X-Client-Key': alertProxyClientKey, 'X-Client-Version': getClientVersion() },
            signal: AbortSignal.timeout(POLICY_TIMEOUT_MS),
        });
        if (!response.ok) return null;

        const data = await response.json();
        if (!data || typeof data.minVersion !== 'string' || !data.minVersion) return null;

        const enforceAfterMs = data.enforceAfter ? Date.parse(data.enforceAfter) : NaN;
        return { minVersion: data.minVersion, enforceAfterMs: Number.isFinite(enforceAfterMs) ? enforceAfterMs : Date.now() };
    } catch (err) {
        return null;
    }
}

function resolveMode(currentVersion, policy, now) {
    if (!policy || compareVersions(currentVersion, policy.minVersion) >= 0) return { kind: 'normal' };
    if (now < policy.enforceAfterMs) return { kind: 'mandatory' };
    if (now < policy.enforceAfterMs + SILENT_AFTER_MS) return { kind: 'forced' };
    return { kind: 'silent' };
}

module.exports = { fetchPolicy, resolveMode, compareVersions };

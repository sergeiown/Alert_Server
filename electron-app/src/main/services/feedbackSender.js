// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { loadLocalConfig } = require('./localConfig');
const settingsStore = require('./settingsStore');
const { PROXY_URL, getClientVersion, proxyFetch, describeError } = require('./proxyConfig');

const KINDS = ['idea', 'problem', 'other'];

async function sendFeedback(input) {
    const { alertProxyClientKey } = loadLocalConfig();
    if (!alertProxyClientKey) return { ok: false, reason: 'network' };

    const payload = {
        kind: KINDS.includes(input && input.kind) ? input.kind : 'other',
        name: String((input && input.name) || ''),
        contact: String((input && input.contact) || ''),
        text: String((input && input.text) || ''),
        language: settingsStore.getSettings().language,
    };

    try {
        const response = await proxyFetch(`${PROXY_URL}/feedback`, {
            method: 'POST',
            headers: { 'X-Client-Key': alertProxyClientKey, 'X-Client-Version': getClientVersion(), 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (response.ok) {
            logEvent(`Feedback sent (${payload.kind}, ${payload.text.length} chars)`, 'INFO');
            return { ok: true };
        }
        let reason = response.status === 404 || response.status === 405 || response.status >= 500 ? 'unavailable' : 'network';
        try {
            const data = await response.json();
            if (data && typeof data.error === 'string') reason = data.error;
        } catch (err) {
            reason = 'network';
        }
        logEvent(`Feedback rejected: ${response.status} ${reason}`, 'WARNING');
        return { ok: false, reason };
    } catch (err) {
        logEvent(`Feedback send error: ${describeError(err)}`, 'NETWORK');
        return { ok: false, reason: 'network' };
    }
}

module.exports = { sendFeedback };

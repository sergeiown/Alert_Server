// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { PROXY_URL } = require('./proxyConfig');
const { startProxyStream } = require('./proxyAlertStream');
const { setAlertSourcesStatus } = require('./alertState');

const SOURCE_LABELS = { ia: 'alerts.in.ua', ua: 'UkraineAlarm', np: 'Neptun' };

let lastSignature = null;

function signatureOf(status) {
    const parts = Object.keys(SOURCE_LABELS).map((key) => `${key}:${status.sources && status.sources[key] ? status.sources[key].state : '-'}`);
    const webhook = status.sources && status.sources.ua ? status.sources.ua.webhook : null;
    return `${parts.join(' ')} webhook:${webhook || '-'} degraded:${Boolean(status.degraded)}`;
}

function describeStatus(status) {
    const parts = Object.entries(SOURCE_LABELS).map(([key, label]) => {
        const source = status.sources && status.sources[key];
        return `${label} ${source ? source.state : 'unknown'}`;
    });
    return parts.join(', ');
}

function noteStatus(message) {
    if (!message || !message.sources) return;
    const status = { sources: message.sources, degraded: Boolean(message.degraded) };
    setAlertSourcesStatus(status);

    const signature = signatureOf(status);
    if (signature === lastSignature) return;
    const first = lastSignature === null;
    lastSignature = signature;
    if (first && !status.degraded) return;
    logEvent(`Alert sources: ${describeStatus(status)}${status.degraded ? ' (degraded)' : ''}`, status.degraded ? 'WARNING' : 'NETWORK');
}

function hasUsableData(data) {
    const sources = data && data.sources;
    if (!sources) return true;
    const down = (key) => !sources[key] || sources[key].state === 'down';
    return !(down('ia') && down('ua') && (!sources.np || sources.np.state !== 'ok'));
}

function startPolling(clientKey, onUpdate, onHealthChange) {
    return startProxyStream({
        label: 'Alert Server',
        wsPath: '/ws-merged',
        pollUrl: `${PROXY_URL}/alerts-merged`,
        clientKey,
        onUpdate,
        onHealthChange,
        hooks: {
            onData: noteStatus,
            accept: hasUsableData,
            acceptHeartbeat: hasUsableData,
            onHeartbeat: noteStatus,
        },
    });
}

module.exports = { startPolling };

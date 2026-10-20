// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { PROXY_URL } = require('./proxyConfig');
const { startProxyStream } = require('./proxyAlertStream');

const ORIGIN_ISSUE_LOG_COOLDOWN_MS = 30 * 60 * 1000;

let lastLoggedStatus = null;
let lastLoggedAt = 0;

function describeOriginStatus(status) {
    if (status === 401) return 'token invalid, revoked, or expired';
    if (status === 403) return 'IP blocked or country unavailable';
    if (status === 429) return 'rate limit exceeded';
    return `unexpected status ${status}`;
}

function logOriginIssue(status) {
    const now = Date.now();
    if (status === lastLoggedStatus && now - lastLoggedAt < ORIGIN_ISSUE_LOG_COOLDOWN_MS) return;
    lastLoggedStatus = status;
    lastLoggedAt = now;
    logEvent(`alerts.in.ua origin issue: ${status} (${describeOriginStatus(status)})`, 'NETWORK');
}

function noteOriginHealthy() {
    if (lastLoggedStatus === null) return;
    logEvent('alerts.in.ua origin recovered', 'NETWORK');
    lastLoggedStatus = null;
}

function startPolling(clientKey, onUpdate, onHealthChange) {
    return startProxyStream({
        label: 'alerts.in.ua',
        wsPath: '/ws-alerts-in-ua',
        pollUrl: PROXY_URL,
        clientKey,
        onUpdate,
        onHealthChange,
        hooks: {
            onLinkHealthy: noteOriginHealthy,
            onPollFailed: logOriginIssue,
            onPollResponse: (response) => {
                const originErrorStatus = response.headers.get('X-Origin-Error-Status');
                if (originErrorStatus) logOriginIssue(Number(originErrorStatus));
                else noteOriginHealthy();
            },
        },
    });
}

module.exports = { startPolling };

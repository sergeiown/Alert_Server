// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');
const { logEvent } = require('./logger');
const { setLatestAlertData, getLatestAlertData } = require('./activeAlertData');

const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';
const POLL_INTERVAL_MS = 30000;
const ORIGIN_ISSUE_LOG_COOLDOWN_MS = 30 * 60 * 1000;

let lastModified = null;
let backoffUntil = 0;
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
    logEvent(`alert-proxy origin issue (alerts.in.ua): ${status} (${describeOriginStatus(status)})`, 'NETWORK');
}

function noteOriginHealthy() {
    if (lastLoggedStatus === null) return;
    logEvent('alert-proxy origin recovered (alerts.in.ua)', 'NETWORK');
    lastLoggedStatus = null;
}

async function pollOnce(clientKey) {
    if (Date.now() < backoffUntil) {
        return getLatestAlertData();
    }

    try {
        const headers = { 'X-Client-Key': clientKey };
        if (lastModified) headers['If-Modified-Since'] = lastModified;

        const response = await fetch(PROXY_URL, { headers });

        if (response.status === 304) {
            noteOriginHealthy();
            return getLatestAlertData();
        }

        if (response.status === 429) {
            logOriginIssue(429);
            backoffUntil = Date.now() + POLL_INTERVAL_MS * 2;
            return getLatestAlertData();
        }

        if (!response.ok) {
            logOriginIssue(response.status);
            return getLatestAlertData();
        }

        const data = await response.json();
        lastModified = response.headers.get('Last-Modified');
        setLatestAlertData(data);

        const originErrorStatus = response.headers.get('X-Origin-Error-Status');
        if (originErrorStatus) logOriginIssue(Number(originErrorStatus));
        else noteOriginHealthy();

        fs.writeFileSync(getUserDataFile('alert_received.json'), JSON.stringify(data, null, 2), 'utf-8');

        return data;
    } catch (err) {
        logEvent(`alert-proxy request error: ${err.message}`, 'NETWORK');
        return getLatestAlertData();
    }
}

function startPolling(clientKey, onUpdate) {
    const tick = async () => {
        const data = await pollOnce(clientKey);
        if (data) onUpdate(data);
    };

    tick();
    return setInterval(tick, POLL_INTERVAL_MS);
}

module.exports = { startPolling };

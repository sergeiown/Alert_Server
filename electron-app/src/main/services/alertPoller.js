const fs = require('fs');
const { getUserDataFile } = require('./appPaths');
const { logEvent } = require('./logger');

const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';
const POLL_INTERVAL_MS = 30000;
const ORIGIN_ISSUE_LOG_COOLDOWN_MS = 30 * 60 * 1000;

let lastModified = null;
let latestAlertData = null;
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
    logEvent(`alert-proxy origin issue: ${status} (${describeOriginStatus(status)})`);
}

function noteOriginHealthy() {
    if (lastLoggedStatus === null) return;
    logEvent('alert-proxy origin recovered');
    lastLoggedStatus = null;
}

async function pollOnce(clientKey) {
    if (Date.now() < backoffUntil) {
        return latestAlertData;
    }

    try {
        const headers = { 'X-Client-Key': clientKey };
        if (lastModified) headers['If-Modified-Since'] = lastModified;

        const response = await fetch(PROXY_URL, { headers });

        if (response.status === 304) {
            noteOriginHealthy();
            return latestAlertData;
        }

        if (response.status === 429) {
            logOriginIssue(429);
            backoffUntil = Date.now() + POLL_INTERVAL_MS * 2;
            return latestAlertData;
        }

        if (!response.ok) {
            logOriginIssue(response.status);
            return latestAlertData;
        }

        const data = await response.json();
        lastModified = response.headers.get('Last-Modified');
        latestAlertData = data;

        const originErrorStatus = response.headers.get('X-Origin-Error-Status');
        if (originErrorStatus) logOriginIssue(Number(originErrorStatus));
        else noteOriginHealthy();

        fs.writeFileSync(getUserDataFile('alert_received.json'), JSON.stringify(data, null, 2), 'utf-8');

        return latestAlertData;
    } catch (err) {
        logEvent(`alert-proxy request error: ${err.message}`);
        return latestAlertData;
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

function getLatestAlertData() {
    return latestAlertData;
}

module.exports = { startPolling, getLatestAlertData };

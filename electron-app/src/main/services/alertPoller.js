const fs = require('fs');
const { getUserDataFile } = require('./appPaths');
const { logEvent } = require('./logger');

const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';
const POLL_INTERVAL_MS = 30000;

let lastModified = null;
let latestAlertData = null;

async function pollOnce(clientKey) {
    try {
        const headers = { 'X-Client-Key': clientKey };
        if (lastModified) headers['If-Modified-Since'] = lastModified;

        const response = await fetch(PROXY_URL, { headers });

        if (response.status === 304) {
            return latestAlertData;
        }

        if (!response.ok) {
            logEvent(`alert-proxy request failed: ${response.status}`);
            return latestAlertData;
        }

        const data = await response.json();
        lastModified = response.headers.get('Last-Modified');
        latestAlertData = data;

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

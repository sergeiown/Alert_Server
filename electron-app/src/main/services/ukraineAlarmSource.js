// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

// The app's primary live-alert source (selectable in Settings, settingsStore's
// alertSourceProvider) - community-level granularity like alerts.in.ua, plus native English
// region names and a richer alert-type set, via UkraineAlarm (api.ukrainealarm.com) through
// alert-proxy. The proxy does its own filtering (drops "stuck" alerts and unmapped types) before
// this ever sees the data - see alert-proxy/src/index.js's getUkraineAlarmAlerts(). Produces the
// same alertData.alerts shape alertPoller.js/neptunAlertsSource.js do, so every downstream
// consumer works unmodified regardless of which source is actually polling.

const { logEvent } = require('./logger');
const { setLatestAlertData, getLatestAlertData } = require('./activeAlertData');

const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev/ukrainealarm-alerts';
const POLL_INTERVAL_MS = 30000;

async function pollOnce(clientKey, onHealthChange) {
    try {
        const response = await fetch(PROXY_URL, { headers: { 'X-Client-Key': clientKey } });

        if (!response.ok) {
            logEvent(`UkraineAlarm (via alert-proxy) fetch failed: ${response.status}`, 'NETWORK');
            if (onHealthChange) onHealthChange(false);
            return getLatestAlertData();
        }

        const data = await response.json();
        setLatestAlertData(data);
        if (onHealthChange) onHealthChange(true);
        return data;
    } catch (err) {
        logEvent(`UkraineAlarm (via alert-proxy) request error: ${err.message}`, 'NETWORK');
        if (onHealthChange) onHealthChange(false);
        return getLatestAlertData();
    }
}

function startPolling(clientKey, onUpdate, onHealthChange) {
    const tick = async () => {
        const data = await pollOnce(clientKey, onHealthChange);
        if (data) onUpdate(data);
    };

    tick();
    return setInterval(tick, POLL_INTERVAL_MS);
}

module.exports = { startPolling };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

// Wraps the three live-alert pollers (ukraineAlarmSource.js, alertPoller.js, neptunAlertsSource.js)
// in a single active-source chain with automatic failover: the user's chosen preferred source
// (settingsStore's alertSourceProvider) runs first, and after a few consecutive failed polls this
// switches to the next source in the chain instead of quietly serving stale cached data forever.
// Only ever one source's interval runs at a time - both they and every downstream consumer
// (notifications, live map, forecast) go through the same activeAlertData.js singleton, so two
// pollers running concurrently would race each other writing to it.

const { logEvent } = require('./logger');
const { startPolling: startUkraineAlarmPolling } = require('./ukraineAlarmSource');
const { startPolling: startAlertsInUaPolling } = require('./alertPoller');
const { startPolling: startNeptunPolling } = require('./neptunAlertsSource');
const { setActiveAlertSource } = require('./alertState');

// A few bad polls in a row (not just one - a single transient blip shouldn't trigger a switch)
// before treating a source as actually down.
const FAILURE_THRESHOLD = 3;
// How often to retry the preferred source once a fallback is active, so the app finds its way
// back automatically rather than staying on a fallback forever once the preferred source recovers.
const RECOVERY_RETRY_MS = 5 * 60 * 1000;

const SOURCES = {
    ukrainealarm: {
        label: 'UkraineAlarm via alert-proxy',
        start: (clientKey, onUpdate, onHealthChange) => startUkraineAlarmPolling(clientKey, onUpdate, onHealthChange),
    },
    'alerts.in.ua': {
        label: 'alerts.in.ua via alert-proxy',
        start: (clientKey, onUpdate, onHealthChange) => startAlertsInUaPolling(clientKey, onUpdate, onHealthChange),
    },
    neptun: {
        label: 'Neptun',
        start: (clientKey, onUpdate, onHealthChange) => startNeptunPolling(onUpdate, onHealthChange),
    },
};

function buildChain(preferred) {
    const rest = Object.keys(SOURCES).filter((key) => key !== preferred);
    return [preferred, ...rest];
}

// `onAlertsPolled(sourceLabel, alertData)` matches the shape index.js already used for its own
// manual single-source dispatch - the manager takes over deciding WHICH source calls it and when.
function startAlertSourceManager(preferredProvider, clientKey, onAlertsPolled) {
    const chain = buildChain(preferredProvider);
    let activeIndex = 0;
    let consecutiveFailures = 0;
    let activeHandle = null;

    function stopActive() {
        if (activeHandle) clearInterval(activeHandle);
        activeHandle = null;
    }

    function activate(index, reason) {
        stopActive();
        activeIndex = index;
        consecutiveFailures = 0;
        const key = chain[index];
        const source = SOURCES[key];

        // Both proxy-backed sources need a client key that might just not be configured - mirrors
        // index.js's previous guard, skipping straight past them in the chain instead of polling
        // with no key (Neptun is the only source that needs none).
        if ((key === 'ukrainealarm' || key === 'alerts.in.ua') && !clientKey) {
            logEvent(`alertProxyClientKey missing from config.local.json, skipping ${source.label} in the failover chain`, 'WARNING');
            if (index < chain.length - 1) activate(index + 1, `${source.label} unavailable (no client key)`);
            return;
        }

        logEvent(`Alert source active: ${source.label}${reason ? ` (${reason})` : ''}`, 'NETWORK');
        setActiveAlertSource(key);
        activeHandle = source.start(clientKey, (alertData) => onAlertsPolled(source.label, alertData), onHealthChange);
    }

    function onHealthChange(healthy) {
        if (healthy) {
            consecutiveFailures = 0;
            return;
        }

        consecutiveFailures++;
        if (consecutiveFailures >= FAILURE_THRESHOLD && activeIndex < chain.length - 1) {
            const from = SOURCES[chain[activeIndex]].label;
            const to = SOURCES[chain[activeIndex + 1]].label;
            logEvent(`Alert source unavailable: ${from} - automatically switching to ${to}`, 'WARNING');
            activate(activeIndex + 1, `failover from ${from}`);
        }
    }

    activate(0);

    setInterval(() => {
        if (activeIndex === 0) return;
        logEvent(`Retrying preferred alert source: ${SOURCES[chain[0]].label}`, 'NETWORK');
        activate(0, 'retrying preferred source');
    }, RECOVERY_RETRY_MS);
}

module.exports = { startAlertSourceManager };

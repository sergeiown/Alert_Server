// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { startPolling: startUkraineAlarmPolling } = require('./ukraineAlarmSource');
const { startPolling: startAlertsInUaPolling } = require('./alertPoller');
const { startPolling: startNeptunPolling } = require('./neptunAlertsSource');
const { setActiveAlertSource } = require('./alertState');

const FAILURE_THRESHOLD = 3;

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

function startAlertSourceManager(preferredProvider, clientKey, onAlertsUpdated) {
    const chain = buildChain(preferredProvider);
    let activeIndex = 0;
    let consecutiveFailures = 0;
    let activeHandle = null;

    function stopActive() {
        if (activeHandle) {
            if (typeof activeHandle.stop === 'function') activeHandle.stop();
            else clearInterval(activeHandle);
        }
        activeHandle = null;
    }

    function activate(index, reason) {
        stopActive();
        activeIndex = index;
        consecutiveFailures = 0;
        const key = chain[index];
        const source = SOURCES[key];

        if ((key === 'ukrainealarm' || key === 'alerts.in.ua') && !clientKey) {
            logEvent(`alertProxyClientKey missing from config.local.json, skipping ${source.label} in the failover chain`, 'WARNING');
            if (index < chain.length - 1) activate(index + 1, `${source.label} unavailable (no client key)`);
            return;
        }

        logEvent(`Alert source active: ${source.label}${reason ? ` (${reason})` : ''}`, 'NETWORK');
        setActiveAlertSource(key);
        activeHandle = source.start(clientKey, (alertData) => onAlertsUpdated(source.label, alertData), onHealthChange);
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

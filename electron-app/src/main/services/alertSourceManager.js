// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { startPolling: startMergedPolling } = require('./mergedAlertsSource');
const { startPolling: startAlertsInUaPolling } = require('./alertPoller');
const { startPolling: startNeptunPolling } = require('./neptunAlertsSource');
const { setActiveAlertSource, setAlertSourcesStatus } = require('./alertState');
const connectionState = require('./connectionState');

const FAILURE_THRESHOLD = 3;

const RECOVERY_RETRY_MS = 5 * 60 * 1000;

const CHAIN = [
    {
        key: 'merged',
        label: 'Alert Server',
        needsClientKey: true,
        start: (clientKey, onUpdate, onHealthChange) => startMergedPolling(clientKey, onUpdate, onHealthChange),
    },
    {
        key: 'alerts.in.ua',
        label: 'alerts.in.ua',
        needsClientKey: true,
        start: (clientKey, onUpdate, onHealthChange) => startAlertsInUaPolling(clientKey, onUpdate, onHealthChange),
    },
    {
        key: 'neptun',
        label: 'Neptun',
        needsClientKey: false,
        start: (clientKey, onUpdate, onHealthChange) => startNeptunPolling(clientKey, onUpdate, onHealthChange),
    },
];

function startAlertSourceManager(clientKey, onAlertsUpdated) {
    let activeIndex = 0;
    let consecutiveFailures = 0;
    let activeHandle = null;
    let linkDownSince = null;

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
        const source = CHAIN[index];

        if (source.needsClientKey && !clientKey) {
            logEvent(`alertProxyClientKey missing from config.local.json - skipping ${source.label} in the failover chain`, 'WARNING');
            if (index < CHAIN.length - 1) activate(index + 1, `${source.label} unavailable (no client key)`);
            return;
        }

        logEvent(`Alert source active: ${source.label}${reason ? ` (${reason})` : ''}`, 'NETWORK');
        setActiveAlertSource(source.key);
        if (source.key !== 'merged') {
            setAlertSourcesStatus({ sources: null, degraded: true });
        }
        activeHandle = source.start(
            clientKey,
            (alertData, meta) => onAlertsUpdated(source.label, alertData, meta),
            onHealthChange
        );
    }

    function onHealthChange(healthy) {
        connectionState.setLinkDown(!healthy);
        if (!healthy && linkDownSince === null) {
            linkDownSince = Date.now();
            logEvent(`Data link lost: ${CHAIN[activeIndex].label} is unreachable`, 'WARNING');
        } else if (healthy && linkDownSince !== null) {
            const seconds = Math.round((Date.now() - linkDownSince) / 1000);
            linkDownSince = null;
            logEvent(`Data link restored after ${seconds} s: ${CHAIN[activeIndex].label}`, 'NETWORK');
        }
        if (healthy) {
            consecutiveFailures = 0;
            return;
        }

        consecutiveFailures++;
        if (consecutiveFailures >= FAILURE_THRESHOLD && activeIndex < CHAIN.length - 1) {
            const from = CHAIN[activeIndex].label;
            const to = CHAIN[activeIndex + 1].label;
            logEvent(`Alert source unavailable: ${from} - automatically switching to ${to}`, 'WARNING');
            activate(activeIndex + 1, `failover from ${from}`);
        }
    }

    activate(0);

    setInterval(() => {
        if (activeIndex === 0) return;
        logEvent(`Retrying primary alert source: ${CHAIN[0].label}`, 'NETWORK');
        activate(0, 'retrying primary source');
    }, RECOVERY_RETRY_MS);
}

module.exports = { startAlertSourceManager };

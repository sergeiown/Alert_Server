// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { startPolling: startMergedPolling } = require('./mergedAlertsSource');
const { startPolling: startAlertsInUaPolling } = require('./alertPoller');
const { startPolling: startNeptunPolling } = require('./neptunAlertsSource');
const { setActiveAlertSource, setAlertSourcesStatus } = require('./alertState');
const connectionState = require('./connectionState');
const { createOutageLog } = require('./outageLog');
const { PROXY_URL, fetchWithTimeout } = require('./proxyConfig');

const FAILURE_THRESHOLD = 3;

const PRIMARY_PROBE_MS = 30 * 1000;
const PROBE_URL = 'https://neptun.in.ua/api/v1/alerts';
const PROBE_TIMEOUT_MS = 5000;

async function alternativeReachable() {
    try {
        await fetchWithTimeout(PROBE_URL, { method: 'HEAD' }, PROBE_TIMEOUT_MS);
        return true;
    } catch (err) {
        return false;
    }
}

async function proxyReachable(clientKey) {
    try {
        const response = await fetchWithTimeout(`${PROXY_URL}/client-policy`, { headers: { 'X-Client-Key': clientKey || '' } }, PROBE_TIMEOUT_MS);
        return response.status < 500;
    } catch (err) {
        return false;
    }
}

const CHAIN = [
    {
        key: 'merged',
        label: 'Alert Server',
        needsClientKey: true,
        viaProxy: true,
        start: (clientKey, onUpdate, onHealthChange) => startMergedPolling(clientKey, onUpdate, onHealthChange),
    },
    {
        key: 'alerts.in.ua',
        label: 'alerts.in.ua',
        needsClientKey: true,
        viaProxy: true,
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
    let probing = false;
    const retryLog = createOutageLog({ label: 'Primary alert source', log: (message) => logEvent(message, 'NETWORK') });
    const stayLog = createOutageLog({ label: 'Alert source switching', log: (message) => logEvent(message, 'WARNING') });

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

        if (reason !== 'retrying primary source') logEvent(`Alert source active: ${source.label}${reason ? ` (${reason})` : ''}`, 'NETWORK');
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
            if (activeIndex === 0 && retryLog.isActive()) retryLog.recover(`Primary alert source restored: ${CHAIN[0].label}`);
            if (stayLog.isActive()) stayLog.recover('Alert sources reachable again');
            return;
        }

        consecutiveFailures++;
        if (consecutiveFailures >= FAILURE_THRESHOLD && activeIndex < CHAIN.length - 1 && !probing) {
            probing = true;
            const index = activeIndex;
            Promise.all([alternativeReachable(), proxyReachable(clientKey)]).then(([reachable, proxyUp]) => {
                probing = false;
                if (index !== activeIndex) return;
                if (!reachable) {
                    consecutiveFailures = 0;
                    stayLog.fail(`No alternative source is reachable: staying on ${CHAIN[activeIndex].label}`);
                    return;
                }
                const nextIndex = CHAIN.findIndex((source, position) => position > activeIndex && (proxyUp || !source.viaProxy));
                if (nextIndex === -1) {
                    consecutiveFailures = 0;
                    return;
                }
                const from = CHAIN[activeIndex].label;
                const to = CHAIN[nextIndex].label;
                logEvent(`Alert source unavailable: ${from} - automatically switching to ${to}`, 'WARNING');
                activate(nextIndex, `failover from ${from}`);
            });
        }
    }

    activate(0);

    const reconnect = () => {
        if (activeHandle && typeof activeHandle.reconnect === 'function') activeHandle.reconnect();
    };

    let probingPrimary = false;
    setInterval(async () => {
        if (activeIndex === 0 || probingPrimary) return;
        probingPrimary = true;
        const up = await proxyReachable(clientKey);
        probingPrimary = false;
        if (activeIndex === 0) return;
        if (!up) {
            retryLog.fail(`Primary alert source is still unreachable: ${CHAIN[0].label}`);
            return;
        }
        activate(0, 'primary source reachable again');
    }, PRIMARY_PROBE_MS);

    return { reconnect };
}

module.exports = { startAlertSourceManager };

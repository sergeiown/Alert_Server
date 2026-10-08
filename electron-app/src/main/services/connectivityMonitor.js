// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { net, powerMonitor } = require('electron');
const { logEvent } = require('./logger');

const CHECK_INTERVAL_MS = 5000;
const TIMER_GAP_THRESHOLD_MS = 30000;

function describeSpan(ms) {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function startConnectivityMonitor() {
    let suspendedAt = null;
    let offlineSince = null;
    let lastTick = Date.now();

    powerMonitor.on('suspend', () => {
        suspendedAt = Date.now();
        logEvent('System is going to sleep - data will stop arriving until it wakes up', 'NETWORK');
    });

    powerMonitor.on('resume', () => {
        const span = suspendedAt ? ` after ${describeSpan(Date.now() - suspendedAt)} asleep` : '';
        suspendedAt = null;
        lastTick = Date.now();
        logEvent(`System woke up${span} - connections will be re-established`, 'NETWORK');
    });

    powerMonitor.on('lock-screen', () => logEvent('Screen locked', 'INFO'));
    powerMonitor.on('unlock-screen', () => logEvent('Screen unlocked', 'INFO'));

    setInterval(() => {
        const now = Date.now();
        const gap = now - lastTick;
        lastTick = now;

        if (gap > TIMER_GAP_THRESHOLD_MS && !suspendedAt) {
            logEvent(`The app was frozen or the system slept for ${describeSpan(gap)} (no timer ticks)`, 'NETWORK');
        }

        const online = net.isOnline();
        if (!online && offlineSince === null) {
            offlineSince = now;
            logEvent('Internet connection lost (network adapter reports no connectivity)', 'NETWORK');
        } else if (online && offlineSince !== null) {
            logEvent(`Internet connection restored after ${describeSpan(now - offlineSince)} offline`, 'NETWORK');
            offlineSince = null;
        }
    }, CHECK_INTERVAL_MS);
}

module.exports = { startConnectivityMonitor };

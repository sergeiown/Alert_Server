// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const config = require('./config');
const gateway = require('./gateway');
const neptun = require('./neptun');
const backup = require('./backup');
const archive = require('./archive');
const users = require('./users');
const geoip = require('./geoip');
const trends = require('./trends');
const occupied = require('./occupied');
const lib = require('./lib');

const TICK_INTERVAL_MS = 5 * 60 * 1000;

function logError(label, err) {
    console.error(`[job:${label}]`, err && err.stack ? err.stack : err);
}

async function tick() {
    try {
        await gateway.refreshOneOblastForToday();
    } catch (err) {
        logError('oblast-refresh', err);
    }

    try {
        await gateway.pollUkraineAlarmIfDue();
    } catch (err) {
        logError('ukrainealarm-poll', err);
    }

}

async function activeLoop() {
    for (;;) {
        try {
            if (config.ALERTS_TOKEN) await gateway.ensureActiveCacheFresh({ force: true });
        } catch (err) {
            logError('alertsinua-active', err);
        } finally {
            await new Promise((resolve) => setTimeout(resolve, gateway.ACTIVE_POLL_INTERVAL_MS));
        }
    }
}

async function loop() {
    for (;;) {
        try {
            await tick();
        } finally {
            await new Promise((resolve) => setTimeout(resolve, TICK_INTERVAL_MS));
        }
    }
}

const BACKFILL_REPEAT_MS = 6 * 60 * 60 * 1000;

async function historyBackfillLoop() {
    for (;;) {
        if (config.ALERTS_TOKEN) {
            let failures = 0;
            for (const uid of lib.ALL_OBLAST_UIDS) {
                try {
                    const response = await gateway.getHistory(String(uid));
                    if (response.status !== 200) failures++;
                } catch (err) {
                    failures++;
                    logError('history-backfill', err);
                }
            }
            if (failures === 0) trends.markBackfillDone();
            console.log(`[backfill] pass finished, failures: ${failures}`);
        }
        await new Promise((resolve) => setTimeout(resolve, BACKFILL_REPEAT_MS));
    }
}

async function maintenanceLoop() {
    for (;;) {
        try {
            backup.runBackupIfDue();
            archive.pruneOldThreats();
            users.prune();
        } catch (err) {
            logError('maintenance', err);
        }
        await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000));
    }
}

async function healthLoop() {
    for (;;) {
        try {
            gateway.checkHealth();
        } catch (err) {
            logError('health', err);
        }
        await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
    }
}

function startRecurringJob() {
    loop();
    activeLoop();
    neptun.start();
    occupied.start();
    geoip.start();
    historyBackfillLoop();
    maintenanceLoop();
    healthLoop();
}

module.exports = { startRecurringJob };

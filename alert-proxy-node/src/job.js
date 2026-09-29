// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const config = require('./config');
const gateway = require('./gateway');

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

function startRecurringJob() {
    loop();
    activeLoop();
}

module.exports = { startRecurringJob };

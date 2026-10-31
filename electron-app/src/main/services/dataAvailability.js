// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const NO_DATA_AFTER_MS = 90 * 1000;
const CHECK_INTERVAL_MS = 10 * 1000;

function createAvailability({ now = Date.now, thresholdMs = NO_DATA_AFTER_MS, checkMs = CHECK_INTERVAL_MS, timers = { setInterval, clearInterval } } = {}) {
    let lastGoodAt = now();
    let state = 'ok';
    let handler = null;
    let timer = null;
    let lastTickAt = now();

    function emit() {
        if (handler) handler(state);
    }

    function check() {
        if (state === 'ok' && now() - lastGoodAt >= thresholdMs) {
            state = 'nodata';
            emit();
        }
    }

    function tick() {
        const current = now();
        const slept = current - lastTickAt > checkMs * 3;
        lastTickAt = current;
        if (slept) {
            if (state === 'ok') lastGoodAt = current;
            return;
        }
        check();
    }

    function noteGoodUpdate() {
        lastGoodAt = now();
        if (state === 'nodata') {
            state = 'ok';
            emit();
        }
    }

    function rearm() {
        if (state === 'ok') lastGoodAt = now();
    }

    function start() {
        if (timer) return;
        timer = timers.setInterval(tick, checkMs);
        if (timer && typeof timer.unref === 'function') timer.unref();
    }

    function stop() {
        if (!timer) return;
        timers.clearInterval(timer);
        timer = null;
    }

    return {
        check,
        tick,
        noteGoodUpdate,
        rearm,
        start,
        stop,
        getState: () => state,
        onChange: (callback) => {
            handler = callback;
        },
    };
}

const shared = createAvailability();

module.exports = {
    createAvailability,
    NO_DATA_AFTER_MS,
    noteGoodUpdate: shared.noteGoodUpdate,
    rearm: shared.rearm,
    start: shared.start,
    stop: shared.stop,
    getState: shared.getState,
    onChange: shared.onChange,
};

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const { createAvailability } = require('../src/main/services/dataAvailability');

const MINUTE = 60 * 1000;
let passed = 0;

function run(name, fn) {
    fn();
    passed++;
    console.log(`ok - ${name}`);
}

function setup(thresholdMs = 3 * MINUTE) {
    const clock = { t: 1_000_000 };
    const events = [];
    const availability = createAvailability({
        now: () => clock.t,
        thresholdMs,
        timers: { setInterval: () => ({ unref() {} }), clearInterval() {} },
    });
    availability.onChange((state) => events.push(state));
    return { clock, events, availability };
}

run('stays quiet before the threshold', () => {
    const { clock, events, availability } = setup();
    clock.t += 2 * MINUTE + 59 * 1000;
    availability.check();
    assert.deepStrictEqual(events, []);
    assert.strictEqual(availability.getState(), 'ok');
});

run('reports no data exactly once after three minutes without updates', () => {
    const { clock, events, availability } = setup();
    clock.t += 3 * MINUTE;
    availability.check();
    clock.t += 5 * MINUTE;
    availability.check();
    availability.check();
    assert.deepStrictEqual(events, ['nodata']);
    assert.strictEqual(availability.getState(), 'nodata');
});

run('a good update postpones the countdown', () => {
    const { clock, events, availability } = setup();
    clock.t += 2 * MINUTE;
    availability.noteGoodUpdate();
    clock.t += 2 * MINUTE;
    availability.check();
    assert.deepStrictEqual(events, []);
    clock.t += MINUTE;
    availability.check();
    assert.deepStrictEqual(events, ['nodata']);
});

run('restoring reports ok exactly once', () => {
    const { clock, events, availability } = setup();
    clock.t += 4 * MINUTE;
    availability.check();
    availability.noteGoodUpdate();
    availability.noteGoodUpdate();
    clock.t += 10 * 1000;
    availability.check();
    assert.deepStrictEqual(events, ['nodata', 'ok']);
    assert.strictEqual(availability.getState(), 'ok');
});

run('a second outage after recovery is reported again', () => {
    const { clock, events, availability } = setup();
    clock.t += 4 * MINUTE;
    availability.check();
    availability.noteGoodUpdate();
    clock.t += 4 * MINUTE;
    availability.check();
    assert.deepStrictEqual(events, ['nodata', 'ok', 'nodata']);
});

run('first launch without any update counts three minutes from the start', () => {
    const { clock, events, availability } = setup();
    clock.t += 2 * MINUTE;
    availability.check();
    assert.deepStrictEqual(events, []);
    clock.t += 61 * 1000;
    availability.check();
    assert.deepStrictEqual(events, ['nodata']);
});

run('a good update in the first seconds means no notification at all', () => {
    const { clock, events, availability } = setup();
    clock.t += 5 * 1000;
    availability.noteGoodUpdate();
    clock.t += 2 * MINUTE;
    availability.check();
    assert.deepStrictEqual(events, []);
});

run('rearm after sleep gives a fresh grace period', () => {
    const { clock, events, availability } = setup();
    clock.t += 30 * MINUTE;
    availability.rearm();
    availability.check();
    assert.deepStrictEqual(events, []);
    clock.t += 3 * MINUTE;
    availability.check();
    assert.deepStrictEqual(events, ['nodata']);
});

run('rearm does not hide an outage that is already reported', () => {
    const { clock, events, availability } = setup();
    clock.t += 4 * MINUTE;
    availability.check();
    availability.rearm();
    clock.t += 10 * MINUTE;
    availability.check();
    assert.deepStrictEqual(events, ['nodata']);
    assert.strictEqual(availability.getState(), 'nodata');
});

run('start and stop schedule one timer', () => {
    const calls = { set: 0, clear: 0 };
    const availability = createAvailability({
        timers: {
            setInterval: () => {
                calls.set++;
                return { unref() {} };
            },
            clearInterval: () => {
                calls.clear++;
            },
        },
    });
    availability.start();
    availability.start();
    availability.stop();
    availability.stop();
    assert.deepStrictEqual(calls, { set: 1, clear: 1 });
});

console.log(`\n${passed} checks passed`);

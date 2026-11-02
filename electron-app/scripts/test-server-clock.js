// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const clock = require('../src/main/services/serverClock');

function check(name, fn) {
    clock.reset();
    fn();
    console.log(`ok - ${name}`);
}

check('without samples the clock is the local one', () => {
    assert.strictEqual(clock.getOffsetMs(), 0);
    assert.ok(Math.abs(clock.now() - Date.now()) < 5);
});

check('a local clock 16 seconds behind is corrected', () => {
    const serverTime = Date.UTC(2026, 10, 2, 13, 27, 38, 0);
    const localStart = serverTime - 16000 - 100;
    clock.observe(serverTime, localStart, localStart + 200);
    assert.ok(Math.abs(clock.getOffsetMs() - 16400) <= 600, `offset ${clock.getOffsetMs()}`);
});

check('a local clock ahead of the server is corrected the other way', () => {
    const serverTime = Date.UTC(2026, 10, 2, 13, 27, 38, 0);
    const localStart = serverTime + 8000 - 50;
    clock.observe(serverTime, localStart, localStart + 100);
    assert.ok(clock.getOffsetMs() < -7000 && clock.getOffsetMs() > -8600, `offset ${clock.getOffsetMs()}`);
});

check('slow round trips and bad values are ignored', () => {
    clock.observe(Date.now() + 60000, Date.now(), Date.now() + 9000);
    clock.observe(NaN, Date.now(), Date.now() + 10);
    clock.observeResponse({ headers: { get: () => null } }, Date.now(), Date.now() + 10);
    assert.strictEqual(clock.getOffsetMs(), 0);
});

check('the median shrugs off a single outlier', () => {
    const base = Date.UTC(2026, 10, 2, 13, 0, 0, 0);
    for (let i = 0; i < 8; i++) clock.observe(base + i * 1000, base + i * 1000 - 12000, base + i * 1000 - 11900);
    clock.observe(base + 9000, base + 9000 - 40000, base + 9000 - 39900);
    assert.ok(Math.abs(clock.getOffsetMs() - 12000) <= 1000, `offset ${clock.getOffsetMs()}`);
});

check('observeResponse reads the Date header', () => {
    const serverTime = Date.UTC(2026, 10, 2, 13, 27, 38, 0);
    const localStart = serverTime - 5000;
    clock.observeResponse({ headers: { get: (name) => (name === 'date' ? new Date(serverTime).toUTCString() : null) } }, localStart, localStart + 100);
    assert.ok(Math.abs(clock.getOffsetMs() - 5450) <= 600, `offset ${clock.getOffsetMs()}`);
});

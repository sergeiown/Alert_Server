// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const { createConnectionState } = require('../src/main/services/connectionStateCore');
const { createAvailability } = require('../src/main/services/dataAvailability');

function check(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function harness() {
    let clock = 1000;
    const events = [];
    const state = createConnectionState({ now: () => clock, onChange: (value) => events.push(value) });
    return { state, events, advance: (ms) => (clock += ms) };
}

check('starts online with no banner', () => {
    const { state, events } = harness();
    assert.deepStrictEqual(state.get(), { offline: false, reason: null, since: null });
    assert.strictEqual(events.length, 0);
});

check('losing the network is offline immediately', () => {
    const { state, events, advance } = harness();
    advance(500);
    state.setOnline(false);
    assert.strictEqual(state.get().offline, true);
    assert.strictEqual(state.get().reason, 'offline');
    assert.strictEqual(state.get().since, 1500);
    assert.strictEqual(events.length, 1);
});

check('no data with the network up is reported as nodata', () => {
    const { state, events } = harness();
    state.setNoData(true);
    assert.strictEqual(state.get().reason, 'nodata');
    assert.strictEqual(events.length, 1);
});

check('duplicate events are not broadcast twice', () => {
    const { state, events } = harness();
    state.setOnline(false);
    state.setOnline(false);
    state.setNoData(true);
    state.setNoData(true);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(state.get().reason, 'offline');
});

check('offline wins over nodata and nodata shows again once the network returns', () => {
    const { state, events, advance } = harness();
    state.setNoData(true);
    advance(100);
    state.setOnline(false);
    assert.strictEqual(state.get().reason, 'offline');
    advance(100);
    state.setOnline(true);
    assert.strictEqual(state.get().reason, 'nodata');
    assert.strictEqual(events.length, 3);
});

check('everything recovered clears the banner', () => {
    const { state, events } = harness();
    state.setOnline(false);
    state.setOnline(true);
    assert.deepStrictEqual(state.get(), { offline: false, reason: null, since: null });
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].offline, false);
});

check('ninety seconds without data drive nodata through the availability service', () => {
    let clock = 0;
    const availability = createAvailability({ now: () => clock, timers: { setInterval: () => null, clearInterval: () => {} } });
    const state = createConnectionState({ now: () => clock });
    availability.onChange((value) => state.setNoData(value === 'nodata'));
    clock = 89000;
    availability.check();
    assert.strictEqual(state.get().offline, false);
    clock = 91000;
    availability.check();
    assert.strictEqual(state.get().reason, 'nodata');
    availability.noteGoodUpdate();
    assert.strictEqual(state.get().offline, false);
});

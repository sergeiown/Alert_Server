// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('assert');
const { ROWS, SECONDS_OPTIONS, DEFAULTS, normalize, resolve } = require('../src/main/services/notifyProfile');

let passed = 0;
const check = (name, fn) => {
    fn();
    passed++;
    console.log(`ok - ${name}`);
};

check('defaults match the agreed design', () => {
    assert.deepStrictEqual(normalize(undefined), DEFAULTS);
    assert.strictEqual(resolve(undefined, 'startRed').ms, 25000);
    assert.strictEqual(resolve(undefined, 'startRed').emergency, true);
    assert.strictEqual(resolve(undefined, 'startYellow').ms, 20000);
    assert.strictEqual(resolve(undefined, 'startYellow').emergency, false);
    assert.strictEqual(resolve(undefined, 'end').ms, 15000);
    assert.strictEqual(resolve(undefined, 'forecast').ms, 15000);
});

check('every row is present after normalizing garbage', () => {
    [null, 5, 'x', [], { startRed: 3 }, { startRed: { emergency: 'yes', seconds: 'abc' } }].forEach((raw) => {
        const result = normalize(raw);
        assert.deepStrictEqual(Object.keys(result), ROWS);
        ROWS.forEach((key) => {
            assert.strictEqual(typeof result[key].emergency, 'boolean');
            assert.ok(SECONDS_OPTIONS.includes(result[key].seconds));
        });
    });
});

check('seconds snap to the nearest offered value, out of range ends at the edges', () => {
    assert.strictEqual(normalize({ end: { seconds: 22 } }).end.seconds, 20);
    assert.strictEqual(normalize({ end: { seconds: 1 } }).end.seconds, 7);
    assert.strictEqual(normalize({ end: { seconds: 99999 } }).end.seconds, 900);
});

check('a partial override keeps the other rows at their defaults', () => {
    const result = normalize({ startYellow: { emergency: true } });
    assert.strictEqual(result.startYellow.emergency, true);
    assert.strictEqual(result.startYellow.seconds, 20);
    assert.deepStrictEqual(result.startRed, DEFAULTS.startRed);
});

check('resolve gives milliseconds and falls back for an unknown row', () => {
    assert.strictEqual(resolve({ end: { emergency: false, seconds: 60 } }, 'end').ms, 60000);
    assert.strictEqual(resolve(undefined, 'nope').ms, 15000);
});

console.log(`\n${passed} checks passed`);

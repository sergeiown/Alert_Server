// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const online = require('../src/online');

function check(name, fn) {
    fn();
    console.log(`PASS: ${name}`);
}

check('a client with several sockets is counted once under its version', () => {
    const closeMerged = online.open('client-a', '6.0.0');
    const closeNeptun = online.open('client-a', '6.0.0');
    assert.deepStrictEqual(online.byVersion(), { '6.0.0': 1 });
    assert.strictEqual(online.count(), 1);
    closeMerged();
    assert.strictEqual(online.count(), 1);
    closeNeptun();
    assert.strictEqual(online.count(), 0);
});

check('clients are grouped by version and unversioned ones go to unknown', () => {
    const closers = [online.open('a', '5.9.1'), online.open('b', '5.9.1'), online.open('c', '6.0.0'), online.open('d', null)];
    assert.deepStrictEqual(online.byVersion(), { '5.9.1': 2, '6.0.0': 1, unknown: 1 });
    closers.forEach((close) => close());
    assert.deepStrictEqual(online.byVersion(), {});
});

check('closing the same socket twice does not remove another socket of the client', () => {
    const first = online.open('x', '6.0.0');
    const second = online.open('x', '6.0.0');
    first();
    first();
    assert.strictEqual(online.count(), 1);
    second();
    assert.strictEqual(online.count(), 0);
});

console.log('done');

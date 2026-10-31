// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const perfStats = require('../src/perfStats');

function check(name, fn) {
    fn();
    console.log(`PASS: ${name}`);
}

check('a timed task is recorded with its calls and returns the result', () => {
    const result = perfStats.timed('test: sum', () => 2 + 2);
    assert.strictEqual(result, 4);
    perfStats.timed('test: sum', () => 1);
    const task = perfStats.snapshot().tasks.find((entry) => entry.name === 'test: sum');
    assert.strictEqual(task.calls, 2);
    assert.ok(task.totalMs >= 0 && task.maxMs >= 0);
});

check('a task that throws is still recorded and the error is passed on', () => {
    assert.throws(() => perfStats.timed('test: fail', () => { throw new Error('boom'); }), /boom/);
    assert.ok(perfStats.snapshot().tasks.some((entry) => entry.name === 'test: fail'));
});

check('the snapshot reports the event loop and orders tasks by total time', () => {
    perfStats.record('test: slow', 50);
    perfStats.record('test: fast', 1);
    const snapshot = perfStats.snapshot();
    assert.ok(snapshot.eventLoop.delayP99Ms >= 0);
    assert.ok(snapshot.eventLoop.overallPercent >= 0);
    const names = snapshot.tasks.map((entry) => entry.name);
    assert.ok(names.indexOf('test: slow') < names.indexOf('test: fast'));
});

check('the number of distinct task names is bounded', () => {
    for (let i = 0; i < 200; i += 1) perfStats.record(`test: flood ${i}`, 1);
    const names = new Set(perfStats.snapshot().tasks.map((entry) => entry.name));
    assert.ok(names.size <= 10);
    assert.ok(perfStats.snapshot().tasks.length <= 10);
});

console.log('done');
process.exit(0);

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const { createOutageLog, formatSpan } = require('../src/main/services/outageLog');

function check(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function setup() {
    const lines = [];
    const clock = { t: 0 };
    const outage = createOutageLog({ label: 'Stream', log: (message) => lines.push(message), now: () => clock.t });
    return { lines, clock, outage };
}

check('only the first failure of an outage is written', () => {
    const { lines, clock, outage } = setup();
    outage.fail('closed');
    clock.t += 5000;
    outage.fail('closed');
    clock.t += 10000;
    outage.fail('closed');
    assert.deepStrictEqual(lines, ['closed']);
});

check('a summary line appears every five minutes of an outage', () => {
    const { lines, clock, outage } = setup();
    outage.fail('closed');
    clock.t += 60000;
    outage.fail('closed');
    clock.t += 5 * 60000;
    outage.fail('closed');
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[1], 'Stream: still unreachable after 3 attempts in 6 min 0 s');
});

check('recovery writes one line with the attempts and the duration', () => {
    const { lines, clock, outage } = setup();
    outage.fail('closed');
    clock.t += 20000;
    outage.fail('closed');
    clock.t += 30000;
    outage.recover('Stream connected');
    assert.deepStrictEqual(lines, ['closed', 'Stream connected after 2 attempts in 50 s']);
    assert.strictEqual(outage.isActive(), false);
});

check('a normal connect without an outage is written as is', () => {
    const { lines, outage } = setup();
    outage.recover('Stream connected');
    assert.deepStrictEqual(lines, ['Stream connected']);
});

check('a new outage after a recovery is written again', () => {
    const { lines, clock, outage } = setup();
    outage.fail('closed');
    outage.recover('Stream connected');
    clock.t += 1000;
    outage.fail('closed again');
    assert.deepStrictEqual(lines, ['closed', 'Stream connected after 1 attempt in 0 s', 'closed again']);
});

check('spans are formatted in seconds below two minutes and in minutes above', () => {
    assert.strictEqual(formatSpan(45000), '45 s');
    assert.strictEqual(formatSpan(125000), '2 min 5 s');
});

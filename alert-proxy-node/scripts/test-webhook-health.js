// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const { classifyWebhook, recordMiss, pruneHistory, CHRONIC_WINDOW_MS } = require('../src/uaWebhookHealth');

const NOW = 1_800_000_000_000;
const miss = (key) => ({ key, at: NOW - 60_000, kind: 'start' });

function check(name, fn) {
    fn();
    console.log(`PASS: ${name}`);
}

check('no misses is healthy', () => {
    const result = classifyWebhook({ configured: true, misses: [], events: 40, history: new Map(), now: NOW });
    assert.strictEqual(result.state, 'healthy');
});

check('a single miss among many events stays healthy', () => {
    const result = classifyWebhook({ configured: true, misses: [miss('1:AIR')], events: 60, history: new Map(), now: NOW });
    assert.strictEqual(result.state, 'healthy');
});

check('five distinct misses among sixty events is only a small share and stays healthy', () => {
    const misses = ['1:AIR', '2:AIR', '3:AIR', '4:AIR', '5:AIR'].map(miss);
    const result = classifyWebhook({ configured: true, misses, events: 60, history: new Map(), now: NOW });
    assert.strictEqual(result.state, 'healthy');
});

check('a large share of missed keys makes it broken', () => {
    const misses = ['1:AIR', '2:AIR', '3:AIR', '4:AIR'].map(miss);
    const result = classifyWebhook({ configured: true, misses, events: 6, history: new Map(), now: NOW });
    assert.strictEqual(result.state, 'broken');
});

check('two distinct misses with few events is suspect', () => {
    const misses = ['1:AIR', '2:AIR'].map(miss);
    const result = classifyWebhook({ configured: true, misses, events: 8, history: new Map(), now: NOW });
    assert.strictEqual(result.state, 'suspect');
});

check('a total silence of the webhook is detected through misses alone', () => {
    const misses = ['1:AIR', '2:AIR', '3:AIR'].map(miss);
    const result = classifyWebhook({ configured: true, misses, events: 0, history: new Map(), now: NOW });
    assert.strictEqual(result.state, 'broken');
});

check('chronically silent keys are excluded from the verdict and reported', () => {
    const history = new Map();
    ['1313:AIR', '353:AIR'].forEach((key) => {
        recordMiss(history, key, NOW - 3_000_000);
        recordMiss(history, key, NOW - 2_000_000);
        recordMiss(history, key, NOW - 1_000_000);
    });
    const misses = ['1313:AIR', '353:AIR', '9:AIR'].map(miss);
    const result = classifyWebhook({ configured: true, misses, events: 5, history, now: NOW });
    assert.strictEqual(result.state, 'healthy');
    assert.deepStrictEqual(result.silentKeys, ['1313:AIR', '353:AIR']);
    assert.strictEqual(result.distinctKeys, 1);
});

check('old misses leave the chronic history', () => {
    const history = new Map();
    recordMiss(history, '1:AIR', NOW - CHRONIC_WINDOW_MS - 1000);
    pruneHistory(history, NOW);
    assert.strictEqual(history.size, 0);
});

check('level changes the webhook never reports do not degrade the state', () => {
    const misses = ['1:AIR', '2:AIR', '3:AIR', '4:AIR'].map((key) => ({ key, at: NOW - 60_000, kind: 'level' }));
    const result = classifyWebhook({ configured: true, misses, events: 5, history: new Map(), now: NOW });
    assert.strictEqual(result.state, 'healthy');
});

check('an unconfigured webhook reports unconfigured', () => {
    const result = classifyWebhook({ configured: false, misses: [], events: 0, history: new Map(), now: NOW });
    assert.strictEqual(result.state, 'unconfigured');
});

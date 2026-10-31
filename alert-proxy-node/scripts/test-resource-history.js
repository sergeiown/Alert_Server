// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const { createResourceHistory, percentile, parseNetDev, MIN_COVERAGE_MS } = require('../src/resourceHistory');
const { evaluate } = require('../src/health');

function check(name, fn) {
    fn();
    console.log(`PASS: ${name}`);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function harness({ cpuBusy = 0.02, memory = 15, netMbps = 0.4 } = {}) {
    let clock = 1_800_000_000_000;
    let cpu = { idle: 0, total: 0 };
    let net = { rx: 0, tx: 0 };
    const state = { cpuBusy, memory, netMbps };
    const history = createResourceHistory({
        db: new DatabaseSync(':memory:'),
        now: () => clock,
        readCpu: () => cpu,
        readMemoryPercent: () => state.memory,
        readNetwork: () => net,
        bandwidthMbps: 1000,
    });
    const tick = (minutes) => {
        for (let i = 0; i < minutes; i++) {
            clock += MINUTE;
            cpu = { idle: cpu.idle + 60000 * (1 - state.cpuBusy), total: cpu.total + 60000 };
            net = { rx: net.rx + (state.netMbps * 1e6 * 60) / 8 / 2, tx: net.tx + (state.netMbps * 1e6 * 60) / 8 / 2 };
            history.sample();
        }
    };
    return { history, tick, state };
}

check('the 95th percentile and the network parser behave', () => {
    assert.strictEqual(percentile([1, 2, 3, 4, 100], 0.95), 100);
    assert.strictEqual(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.5), 50);
    assert.strictEqual(percentile([], 0.5), null);
    const text = 'Inter-|   Receive\n face |bytes packets errs drop fifo frame compressed multicast|bytes packets\n    lo: 500 1 0 0 0 0 0 0 500 1 0 0 0 0 0 0\n  enp0s6: 1000 10 0 0 0 0 0 0 4000 20 0 0 0 0 0 0\n';
    assert.deepStrictEqual(parseNetDev(text), { rx: 1000, tx: 4000 });
    assert.strictEqual(parseNetDev('nothing'), null);
});

check('the first hours only collect data', () => {
    const { history, tick } = harness();
    tick(30);
    const risk = history.getIdleRisk();
    assert.strictEqual(risk.state, 'collecting');
    assert.ok(risk.coverageHours < 1);
});

check('a quiet server with low memory is flagged as at risk', () => {
    const { history, tick } = harness({ memory: 15 });
    tick(MIN_COVERAGE_MS / MINUTE + 60);
    const risk = history.getIdleRisk();
    assert.strictEqual(risk.state, 'at-risk');
    assert.ok(risk.cpuP95 < 20 && risk.memoryMean < 20 && risk.networkMean < 20);
    assert.deepStrictEqual(risk.saving, []);
});

check('memory above the threshold makes the server safe and the saving metric is named', () => {
    const { history, tick } = harness({ memory: 30 });
    tick(8 * 60);
    const risk = history.getIdleRisk();
    assert.strictEqual(risk.state, 'safe');
    assert.deepStrictEqual(risk.saving, ['memory']);
    assert.strictEqual(risk.thin, false);
});

check('memory just above the threshold is reported as a thin margin', () => {
    const { history, tick } = harness({ memory: 22 });
    tick(8 * 60);
    const risk = history.getIdleRisk();
    assert.strictEqual(risk.state, 'safe');
    assert.strictEqual(risk.thin, true);
});

check('busy cpu alone is enough, and the network percentage is measured against the bandwidth', () => {
    const { history, tick } = harness({ cpuBusy: 0.5, memory: 10, netMbps: 100 });
    tick(8 * 60);
    const risk = history.getIdleRisk();
    assert.strictEqual(risk.state, 'safe');
    assert.deepStrictEqual(risk.saving, ['cpu']);
    assert.ok(Math.abs(risk.networkMean - 10) < 0.5, String(risk.networkMean));
});

check('samples older than eight days are pruned', () => {
    const { history, tick } = harness();
    tick(9 * 24 * 60);
    const risk = history.getIdleRisk();
    assert.ok(risk.samples <= 7 * 24 * 60 + 2, String(risk.samples));
});

check('health warns when at risk, notes a thin margin and stays quiet otherwise', () => {
    const status = (idleRisk) => ({
        active: { currentError: null, cacheAgeMs: 1000, percentOfSoftLimit: 0 },
        neptun: { stream: { connected: true, lastMessageAgeMs: 1 }, alerts: { currentError: null, cacheAgeMs: 1000 } },
        occupied: { cacheAgeMs: 1000, dataAgeDays: 1, date: '20261030' },
        backup: { ageMs: 1000 },
        system: { cpuAveragePercent: 1, memory: { usedPercent: 15 }, disk: { usedPercent: 10 }, idleRisk },
    });
    const flags = { alertsConfigured: true, ukraineAlarmConfigured: false };
    const codes = (idleRisk) => evaluate(status(idleRisk), flags).map((issue) => `${issue.level}:${issue.code}`);

    const atRisk = codes({ state: 'at-risk', cpuP95: 3, memoryMean: 15, networkMean: 0.1, threshold: 20, windowDays: 7, saving: [] });
    assert.ok(atRisk.includes('warn:idle-risk'), atRisk.join(','));
    const thin = codes({ state: 'safe', thin: true, saving: ['memory'], threshold: 20 });
    assert.ok(thin.includes('info:idle-margin'), thin.join(','));
    const quiet = codes({ state: 'safe', thin: false, saving: ['memory'], threshold: 20 });
    assert.ok(!quiet.some((code) => code.includes('idle')), quiet.join(','));
    const collecting = codes({ state: 'collecting' });
    assert.ok(!collecting.some((code) => code.includes('idle')), collecting.join(','));
});

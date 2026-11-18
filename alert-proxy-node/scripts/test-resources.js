// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const { LIMITS, parseMeminfo, parsePressure, parseOomKills, readResources, resourceWarnings } = require('../src/resources');

function check(name, fn) {
    fn();
    console.log(`PASS: ${name}`);
}

const MEMINFO = 'MemTotal:        1996000 kB\nMemFree:          160000 kB\nMemAvailable:    1170000 kB\nSwapTotal:       2097148 kB\nSwapFree:        2016000 kB\n';
const CPU_PSI = 'some avg10=7.87 avg60=9.70 avg300=9.07 total=36743213580\n';
const VMSTAT = 'nr_free_pages 40000\noom_kill 0\npgfault 100\n';

check('meminfo gives available memory and used swap in bytes', () => {
    const mem = parseMeminfo(MEMINFO);
    assert.strictEqual(mem.availableBytes, 1170000 * 1024);
    assert.strictEqual(mem.swapTotalBytes - mem.swapFreeBytes, (2097148 - 2016000) * 1024);
    assert.strictEqual(parseMeminfo(null), null);
});

check('pressure files and the oom counter are parsed, missing files give null', () => {
    assert.deepStrictEqual(parsePressure(CPU_PSI), { avg10: 7.87, avg60: 9.7, avg300: 9.07 });
    assert.strictEqual(parsePressure(null), null);
    assert.strictEqual(parseOomKills(VMSTAT), 0);
    assert.strictEqual(parseOomKills('nothing'), null);
});

check('a healthy server has no warnings', () => {
    const files = { '/proc/meminfo': MEMINFO, '/proc/pressure/cpu': CPU_PSI, '/proc/pressure/memory': 'some avg10=0.00 avg60=0.00 avg300=0.00 total=1\n', '/proc/vmstat': VMSTAT };
    const resources = readResources((file) => files[file] || null);
    assert.deepStrictEqual(resourceWarnings(resources, { loadAvg5: 0.19, cpuCount: 1 }), []);
});

check('each threshold raises its own warning', () => {
    const resources = { availableBytes: 100 * 1024 * 1024, swapUsedBytes: 800 * 1024 * 1024, cpuPressure: { avg10: 40, avg60: 35, avg300: 30 }, memoryPressure: null, oomKills: 2 };
    const keys = resourceWarnings(resources, { loadAvg5: 1.6, cpuCount: 2 }).map((w) => w.key).sort();
    assert.deepStrictEqual(keys, ['cpuPressure', 'load', 'memory', 'oom', 'swap']);
    assert.strictEqual(LIMITS.loadPerCore, 0.7);
});

check('unreadable files never raise a warning', () => {
    const resources = readResources(() => null);
    assert.deepStrictEqual(resourceWarnings(resources, { loadAvg5: null, cpuCount: 1 }), []);
});

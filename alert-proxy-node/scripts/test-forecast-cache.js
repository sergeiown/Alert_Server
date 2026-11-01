// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const path = require('node:path');

let archiveCalls = 0;
const archivePath = path.join(__dirname, '..', 'src', 'archive.js');
require.cache[archivePath] = {
    id: archivePath,
    filename: archivePath,
    loaded: true,
    exports: {
        getRegionAlerts: () => {
            archiveCalls += 1;
            return [];
        },
    },
};

const forecast = require('../src/forecast');

function check(name, fn) {
    fn();
    console.log(`PASS: ${name}`);
}

const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;

check('the same set of regions is computed once and then served from the cache', () => {
    archiveCalls = 0;
    const first = forecast.getForecastsJson(['31', '28']);
    const second = forecast.getForecastsJson(['31', '28']);
    assert.strictEqual(first, second);
    assert.strictEqual(archiveCalls, 2);
});

check('the order of the regions and duplicates do not change the cache entry', () => {
    archiveCalls = 0;
    const body = forecast.getForecastsJson(['28', '31', '31']);
    assert.strictEqual(archiveCalls, 0);
    const parsed = JSON.parse(body);
    assert.deepStrictEqual(Object.keys(parsed.forecasts).sort(), ['28', '31']);
});

check('a new region is computed on its own and the others stay cached', () => {
    archiveCalls = 0;
    forecast.getForecastsJson(['31', '28', '14']);
    assert.strictEqual(archiveCalls, 1);
});

check('after five minutes the forecast is computed again', () => {
    archiveCalls = 0;
    clock += 5 * 60 * 1000 + 1000;
    forecast.getForecastsJson(['31', '28']);
    assert.strictEqual(archiveCalls, 2);
});

Date.now = realNow;
console.log('done');
process.exit(0);

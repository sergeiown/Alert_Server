// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('assert');
const Module = require('module');
const path = require('path');
const os = require('os');
const fs = require('fs');

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forecast-notify-'));

const toasts = [];
let alertRecent = false;
let uids = ['1', '2', '3', '4', '5', '6'];
const originalLoad = Module._load;
const name = (file, request) => path.basename(request);

Module._load = function (request, parent, isMain) {
    const base = name(parent && parent.filename, request);
    if (parent && /forecastWatcher\.js$/.test(parent.filename)) {
        if (base === 'logger') return { logEvent: () => {} };
        if (base === 'regionsStore') return { getSelectedUids: () => uids };
        if (base === 'settingsStore')
            return { getSettings: () => ({ language: 'Ukrainian', visualNotificationsEnabled: true, forecastNotifyEnabled: true, forecastNotifyLookaheadMinutes: 120 }) };
        if (base === 'forecast')
            return {
                getRegionSoonestPrediction: async (uid) => ({ type: 'air_raid', projectedNextMs: (Number(uid) + 1) * 60000 }),
                prefetchForecasts: async () => {},
                formatDuration: (ms) => `${Math.round(ms / 60000)} min`,
            };
        if (base === 'activeAlertData') return { getLatestAlertData: () => null };
        if (base === 'locationFilter')
            return {
                getLocationLookup: () => ({ get: (uid) => ({ name: `Регіон ${uid}`, lat: `Region ${uid}` }) }),
                getAlertCoverageUids: () => [],
            };
        if (base === 'alertTypes') return { alertTypeName: () => 'Повітряна тривога' };
        if (base === 'notifier')
            return { notifyWithMap: (options) => toasts.push(options), isAlertActivityRecent: () => alertRecent };
        if (base === 'appPaths') return { getUserDataFile: (file) => path.join(stateDir, file) };
        if (base === 'forecastWindow') return { openForecastWindow: () => {} };
    }
    return originalLoad.apply(this, arguments);
};

const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;

const realSetInterval = global.setInterval;
global.setInterval = () => 0;

const watcher = require('../src/main/services/forecastWatcher');
const tick = async () => {
    watcher.startForecastWatcher();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
};
let passed = 0;
const ok = (label, fn) => {
    fn();
    passed++;
    console.log(`ok - ${label}`);
};

(async () => {
    alertRecent = true;
    await tick();
    ok('no forecast toast while alerts are active or recent', () => assert.strictEqual(toasts.length, 0));

    alertRecent = false;
    await tick();
    ok('many candidates produce exactly one grouped toast', () => {
        assert.strictEqual(toasts.length, 1);
        assert.strictEqual(toasts[0].uids.length, 6);
        assert.ok(/ та ще 2/.test(toasts[0].bodyLines[0]) || /and 2 more|2/.test(toasts[0].bodyLines[0]));
    });
    ok('forecast toasts are silent', () => assert.strictEqual(toasts[0].silent, true));

    clock += 5 * 60000;
    await tick();
    ok('global cooldown blocks the next forecast toast', () => assert.strictEqual(toasts.length, 1));

    clock += 25 * 60000;
    uids = ['9'];
    await tick();
    ok('a single candidate after the cooldown is an ordinary toast', () => {
        assert.strictEqual(toasts.length, 2);
        assert.strictEqual(toasts[1].uid, '9');
    });

    ok('the notified state is written to disk', () => {
        const saved = JSON.parse(fs.readFileSync(path.join(stateDir, 'forecast_notified.json'), 'utf-8'));
        assert.ok(saved.lastToastAt > 0);
        assert.ok(saved.regions['9'] > 0);
    });

    const modulePath = require.resolve('../src/main/services/forecastWatcher');
    delete require.cache[modulePath];
    const restarted = require('../src/main/services/forecastWatcher');
    uids = ['9', '1'];
    clock += 2 * 60000;
    restarted.startForecastWatcher();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    ok('an app restart right after a forecast toast does not announce the forecast again', () => assert.strictEqual(toasts.length, 2));

    clock += 20 * 60000;
    restarted.startForecastWatcher();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    ok('after the cooldown a restarted app announces again', () => assert.strictEqual(toasts.length, 3));

    Date.now = realNow;
    global.setInterval = realSetInterval;
    fs.rmSync(stateDir, { recursive: true, force: true });
    Module._load = originalLoad;
    console.log(`\n${passed} checks passed`);
    process.exit(0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const path = require('node:path');

const services = path.join(__dirname, '..', 'src', 'main', 'services');

const lines = [];
const healthCallbacks = {};
const started = [];
const intervals = [];
const state = { neptunReachable: false, proxyReachable: false };

const realSetInterval = global.setInterval;
global.setInterval = (fn, ms, ...rest) => {
    intervals.push({ fn, ms });
    return realSetInterval(() => {}, 1e9);
};

function stub(name, exports) {
    const file = path.join(services, `${name}.js`);
    require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

stub('logger', { logEvent: (message) => lines.push(message) });
stub('mergedAlertsSource', { startPolling: (key, onUpdate, onHealth) => { started.push('merged'); healthCallbacks.merged = onHealth; return { stop() {} }; } });
stub('alertPoller', { startPolling: (key, onUpdate, onHealth) => { started.push('alerts.in.ua'); healthCallbacks.ia = onHealth; return { stop() {} }; } });
stub('neptunAlertsSource', { startPolling: (key, onUpdate, onHealth) => { started.push('neptun'); healthCallbacks.neptun = onHealth; return { stop() {} }; } });
stub('alertState', { setActiveAlertSource() {}, setAlertSourcesStatus() {} });
stub('connectionState', { setLinkDown() {} });
stub('proxyConfig', {
    PROXY_URL: 'https://proxy.test',
    fetchWithTimeout: async (url) => {
        const reachable = url.startsWith('https://proxy.test') ? state.proxyReachable : state.neptunReachable;
        if (!reachable) throw new Error('unreachable');
        return { status: 200 };
    },
});

const { startAlertSourceManager } = require(path.join(services, 'alertSourceManager.js'));

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
const fail = (callback, times = 3) => {
    for (let i = 0; i < times; i++) callback(false);
};
const reset = () => {
    started.length = 0;
    lines.length = 0;
};

async function run() {
    startAlertSourceManager('key', () => {});
    assert.deepStrictEqual(started, ['merged']);
    const primaryProbe = intervals.find((entry) => entry.ms === 30000);
    assert.ok(primaryProbe, 'a 30 second primary probe is scheduled');

    fail(healthCallbacks.merged);
    await flush();
    assert.deepStrictEqual(started, ['merged']);
    assert.ok(lines.some((line) => line.startsWith('No alternative source is reachable')));
    assert.ok(!lines.some((line) => line.includes('automatically switching')));
    console.log('ok - no switch while no alternative source is reachable');

    state.neptunReachable = true;
    state.proxyReachable = true;
    fail(healthCallbacks.merged);
    await flush();
    assert.deepStrictEqual(started, ['merged', 'alerts.in.ua']);
    assert.ok(lines.some((line) => line.includes('automatically switching to alerts.in.ua')));
    console.log('ok - switches to the next source when the server itself still answers');

    healthCallbacks.ia(true);
    reset();
    state.proxyReachable = false;
    fail(healthCallbacks.ia);
    await flush();
    assert.deepStrictEqual(started, ['neptun']);
    assert.ok(lines.some((line) => line.includes('automatically switching to Neptun')));
    console.log('ok - goes straight to Neptun when the whole server is down');

    reset();
    await primaryProbe.fn();
    assert.deepStrictEqual(started, []);
    assert.ok(lines.some((line) => line.startsWith('Primary alert source is still unreachable')));
    console.log('ok - stays on the fallback while the server is still down');

    state.proxyReachable = true;
    await primaryProbe.fn();
    assert.deepStrictEqual(started, ['merged']);
    assert.ok(lines.some((line) => line.includes('primary source reachable again')));
    console.log('ok - returns to the primary source as soon as the server answers again');

    global.setInterval = realSetInterval;
    process.exit(0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

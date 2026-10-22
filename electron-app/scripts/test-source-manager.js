// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const path = require('node:path');

const services = path.join(__dirname, '..', 'src', 'main', 'services');

const lines = [];
const healthCallbacks = {};
const started = [];
let probeReachable = false;

function stub(name, exports) {
    const file = path.join(services, `${name}.js`);
    require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

stub('logger', { logEvent: (message) => lines.push(message) });
stub('mergedAlertsSource', { startPolling: (key, onUpdate, onHealth) => { started.push('merged'); healthCallbacks.merged = onHealth; return { stop() {} }; } });
stub('alertPoller', { startPolling: (key, onUpdate, onHealth) => { started.push('alerts.in.ua'); healthCallbacks.ia = onHealth; return { stop() {} }; } });
stub('neptunAlertsSource', { startPolling: (key, onUpdate, onHealth) => { started.push('neptun'); healthCallbacks.neptun = onHealth; return setInterval(() => {}, 1e9); } });
stub('alertState', { setActiveAlertSource() {}, setAlertSourcesStatus() {} });
stub('connectionState', { setLinkDown() {} });
stub('proxyConfig', {
    fetchWithTimeout: async () => {
        if (!probeReachable) throw new Error('unreachable');
        return {};
    },
});

const { startAlertSourceManager } = require(path.join(services, 'alertSourceManager.js'));

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

async function run() {
    startAlertSourceManager('key', () => {});
    assert.deepStrictEqual(started, ['merged']);

    for (let i = 0; i < 3; i++) healthCallbacks.merged(false);
    await flush();
    assert.deepStrictEqual(started, ['merged']);
    assert.ok(lines.some((line) => line.startsWith('No alternative source is reachable')));
    assert.ok(!lines.some((line) => line.includes('automatically switching')));
    console.log('ok - no switch while no alternative source is reachable');

    probeReachable = true;
    for (let i = 0; i < 3; i++) healthCallbacks.merged(false);
    await flush();
    assert.deepStrictEqual(started, ['merged', 'alerts.in.ua']);
    assert.ok(lines.some((line) => line.includes('automatically switching to alerts.in.ua')));
    console.log('ok - switches when an alternative source answers');

    healthCallbacks.merged(true);
    process.exit(0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

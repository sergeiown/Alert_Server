// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('assert');
const Module = require('module');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const sockets = [];
const logs = [];

class FakeSocket {
    constructor(url) {
        this.url = url;
        this.closed = false;
        this.handlers = {};
        sockets.push(this);
    }
    addEventListener(event, handler) {
        (this.handlers[event] = this.handlers[event] || []).push(handler);
    }
    emit(event, payload) {
        (this.handlers[event] || []).forEach((handler) => handler(payload));
    }
    close() {
        this.closed = true;
    }
}
global.WebSocket = FakeSocket;

const mocks = {
    fs: { ...require('fs'), writeFileSync() {} },
    './appPaths': { getUserDataFile: (name) => path.join(os.tmpdir(), name) },
    './logger': { logEvent: (message) => logs.push(message) },
    './activeAlertData': { setLatestAlertData() {}, getLatestAlertData: () => null },
    './proxyConfig': {
        PROXY_WS_URL: 'wss://example.test',
        getClientVersion: () => '6.0.0',
        fetchWithTimeout: async () => ({ ok: false, status: 503 }),
        describeError: (err) => err.message,
    },
    './installId': { getInstallId: () => 'install-id' },
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
    if (parent && /proxyAlertStream\.js$/.test(parent.filename) && Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
};

const { startProxyStream } = require(path.join(root, 'src/main/services/proxyAlertStream.js'));
let passed = 0;
const check = (name, fn) => {
    fn();
    passed++;
    console.log(`ok - ${name}`);
};

const updates = [];
const health = [];
const stream = startProxyStream({
    label: 'Alert Server',
    wsPath: '/ws-merged',
    pollUrl: 'https://example.test/alerts-merged',
    clientKey: 'k',
    onUpdate: (data, meta) => updates.push({ data, meta }),
    onHealthChange: (healthy) => health.push(healthy),
});

check('the stream connects on start', () => {
    assert.strictEqual(sockets.length, 1);
    assert.ok(sockets[0].url.startsWith('wss://example.test/ws-merged?key=k'));
});

check('reconnect replaces the socket at once and closes the stale one', () => {
    sockets[0].emit('open');
    stream.reconnect();
    assert.strictEqual(sockets.length, 2);
    assert.strictEqual(sockets[0].closed, true);
    assert.strictEqual(sockets[1].closed, false);
    assert.ok(logs.some((line) => /re-establishing/.test(line)));
});

check('the first message on the new socket delivers data and reports a healthy link', () => {
    sockets[1].emit('open');
    sockets[1].emit('message', { data: JSON.stringify({ alerts: [] }) });
    assert.strictEqual(updates.length, 1);
    assert.strictEqual(health[health.length - 1], true);
});

check('a close event of the stale socket does not trigger another reconnect', () => {
    sockets[0].emit('close', { code: 1006, reason: '' });
    assert.strictEqual(sockets.length, 2);
});

check('reconnect after stop does nothing', () => {
    stream.stop();
    stream.reconnect();
    assert.strictEqual(sockets.length, 2);
});

Module._load = originalLoad;
console.log(`\n${passed} checks passed`);
process.exit(0);

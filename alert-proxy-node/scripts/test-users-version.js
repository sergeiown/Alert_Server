// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'users-version-'));
const users = require('../src/users');

function check(name, fn) {
    fn();
    console.log(`PASS: ${name}`);
}

users.record('hash-with-version', 'ws:/ws-merged', '6.0.0', 'UA');
users.record('hash-without-version', 'ws:/ws-merged', undefined, 'AT');
users.record('hash-broken-version', '/alerts-merged', 'x y z!', 'AT');
users.record('hash-with-version', '/alerts-merged', '6.0.0', 'UA');

const list = users.getUserList();

check('a client that sends its version is counted', () => {
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].version, '6.0.0');
    assert.strictEqual(list[0].requests, 2);
});

check('requests without a usable version are not counted as users', () => {
    assert.ok(!list.some((user) => user.country === 'AT'));
});

check('the route counters still include the unversioned requests', () => {
    const stats = users.getStats(0, 0);
    const routes = Object.fromEntries(stats.routesToday.map((entry) => [entry.route, entry.count]));
    assert.strictEqual(routes['ws:/ws-merged'], 2);
    assert.strictEqual(routes['/alerts-merged'], 2);
});

try {
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
} catch (err) {
    console.log('temporary data folder left in place');
}
process.exit(0);

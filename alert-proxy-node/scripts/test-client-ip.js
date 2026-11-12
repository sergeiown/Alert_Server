// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const { clientIpOf } = require('../src/clientIp');

const req = (remote, forwarded) => ({ socket: { remoteAddress: remote }, headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded } });

function check(name, fn) {
    fn();
    console.log(`PASS: ${name}`);
}

check('behind the local proxy the address added by the proxy is used', () => {
    assert.strictEqual(clientIpOf(req('127.0.0.1', '203.0.113.7')), '203.0.113.7');
    assert.strictEqual(clientIpOf(req('::ffff:127.0.0.1', '203.0.113.7')), '203.0.113.7');
});

check('a value the client put in front of the proxy address is ignored', () => {
    assert.strictEqual(clientIpOf(req('127.0.0.1', '6.6.6.6, 203.0.113.7')), '203.0.113.7');
    assert.strictEqual(clientIpOf(req('127.0.0.1', '6.6.6.6,1.2.3.4, 203.0.113.7')), '203.0.113.7');
});

check('a direct connection never trusts the header', () => {
    assert.strictEqual(clientIpOf(req('198.51.100.9', '6.6.6.6')), '198.51.100.9');
});

check('a missing header falls back to the socket address', () => {
    assert.strictEqual(clientIpOf(req('127.0.0.1')), '127.0.0.1');
    assert.strictEqual(clientIpOf(req('198.51.100.9')), '198.51.100.9');
});

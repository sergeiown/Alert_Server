// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const lib = require('../src/lib');

async function check(name, fn) {
    await fn();
    console.log(`PASS: ${name}`);
}

const ID_A = '3f2b8a4e-9c1d-4e6a-8b7f-1a2b3c4d5e6f';
const ID_B = '7d9e1c2a-5b3f-4a8c-9d0e-6f7a8b9c0d1e';

async function run() {
    await check('a valid install id gives a hash that does not depend on the ip', async () => {
        const first = await lib.hashClientIdentity('10.0.0.1', ID_A);
        const second = await lib.hashClientIdentity('192.168.5.5', ID_A);
        assert.strictEqual(first, second);
        assert.strictEqual(first.length, 16);
    });

    await check('two install ids behind the same ip are two different users', async () => {
        const first = await lib.hashClientIdentity('10.0.0.1', ID_A);
        const second = await lib.hashClientIdentity('10.0.0.1', ID_B);
        assert.notStrictEqual(first, second);
    });

    await check('a missing or invalid id falls back to the ip hash of older clients', async () => {
        const expected = await lib.hashIp('10.0.0.1');
        assert.strictEqual(await lib.hashClientIdentity('10.0.0.1', undefined), expected);
        assert.strictEqual(await lib.hashClientIdentity('10.0.0.1', ''), expected);
        assert.strictEqual(await lib.hashClientIdentity('10.0.0.1', 'not-a-uuid'), expected);
        assert.strictEqual(await lib.hashClientIdentity('10.0.0.1', `${ID_A}x`), expected);
        assert.strictEqual(await lib.hashClientIdentity('10.0.0.1', 12345), expected);
    });

    await check('the id hash never collides with the ip hash of the same text', async () => {
        const idHash = await lib.hashClientIdentity('10.0.0.1', ID_A);
        const plain = (await lib.sha256Hex(ID_A)).slice(0, 16);
        assert.notStrictEqual(idHash, plain);
    });

    await check('ids are case-insensitive and trimmed', async () => {
        const lower = await lib.hashClientIdentity('1.1.1.1', ID_A);
        const upper = await lib.hashClientIdentity('1.1.1.1', `  ${ID_A.toUpperCase()} `);
        assert.strictEqual(lower, upper);
    });

    await check('only version 4 uuids are accepted', async () => {
        assert.strictEqual(lib.normalizeClientId('3f2b8a4e-9c1d-1e6a-8b7f-1a2b3c4d5e6f'), null);
        assert.strictEqual(lib.normalizeClientId(ID_A), ID_A);
    });
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

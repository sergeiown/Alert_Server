// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const { createFeedbackStore, normalize, LIMITS } = require('../src/feedback');

function check(name, fn) {
    fn();
    console.log(`PASS: ${name}`);
}

const A = '3f2b8a4e-9c1d-4e6a-8b7f-1a2b3c4d5e6f';
const B = '7d9e1c2a-5b3f-4a8c-9d0e-6f7a8b9c0d1e';
const GOOD = 'Дуже зручний застосунок, дякую за роботу!';

function fresh() {
    let clock = 1_700_000_000_000;
    const store = createFeedbackStore(new DatabaseSync(':memory:'), () => clock);
    return { store, advance: (ms) => (clock += ms) };
}

const send = (store, clientId, text, extra = {}) =>
    store.submit({ clientId, ipHash: extra.ipHash || 'ip1', country: 'Ukraine', version: '6.0.0', language: 'Ukrainian', payload: { text, ...extra.payload } });

check('a normal message is accepted and listed with client, country and version', () => {
    const { store } = fresh();
    assert.strictEqual(send(store, A, GOOD, { payload: { kind: 'idea', name: ' Іван ', contact: 'me@example.com' } }).status, 200);
    const { items, unread } = store.list();
    assert.strictEqual(unread, 1);
    assert.strictEqual(items[0].clientId, A);
    assert.strictEqual(items[0].country, 'Ukraine');
    assert.strictEqual(items[0].version, '6.0.0');
    assert.strictEqual(items[0].name, 'Іван');
    assert.strictEqual(items[0].kind, 'idea');
});

check('name and contact are optional, unknown kind falls back to other', () => {
    const { store } = fresh();
    send(store, A, GOOD, { payload: { kind: 'hack' } });
    const item = store.list().items[0];
    assert.strictEqual(item.name, null);
    assert.strictEqual(item.contact, null);
    assert.strictEqual(item.kind, 'other');
});

check('too short, too long and too many links are rejected', () => {
    assert.strictEqual(normalize({ text: 'ok' }).error, 'too-short');
    assert.strictEqual(normalize({ text: 'a'.repeat(LIMITS.textMax + 1) }).error, 'too-long');
    assert.strictEqual(normalize({ text: 'see http://a.com http://b.com https://c.com www.d.com for details' }).error, 'too-many-links');
    assert.ok(normalize({ text: 'see https://github.com/x and www.example.org for details' }).value);
    assert.strictEqual(normalize(null).error, 'too-short');
    assert.strictEqual(normalize({ text: 12345678901234 }).error, 'too-short');
});

check('control and bidi characters are stripped, name is length limited', () => {
    const result = normalize({ text: `${GOOD}‮\u0000`, name: 'x'.repeat(200) });
    assert.ok(!/[‮\u0000]/.test(result.value.text));
    assert.strictEqual(result.value.name.length, LIMITS.nameMax);
});

check('the same client has to wait between messages', () => {
    const { store, advance } = fresh();
    assert.strictEqual(send(store, A, GOOD).status, 200);
    const second = send(store, A, `${GOOD} Ще одна думка про це.`);
    assert.strictEqual(second.status, 429);
    assert.ok(second.retryAfterSec > 0);
    advance(LIMITS.perClientGapMs + 1000);
    assert.strictEqual(send(store, A, `${GOOD} Ще одна думка про це.`).status, 200);
});

check('a client is limited per day', () => {
    const { store, advance } = fresh();
    for (let i = 0; i < LIMITS.perClientPerDay; i++) {
        assert.strictEqual(send(store, A, `${GOOD} Номер ${i}`).status, 200);
        advance(LIMITS.perClientGapMs + 1000);
    }
    assert.strictEqual(send(store, A, `${GOOD} Зайвий`).status, 429);
});

check('one ip cannot flood with many fake client ids', () => {
    const { store } = fresh();
    for (let i = 0; i < LIMITS.perIpPerDay; i++) {
        const id = `3f2b8a4e-9c1d-4e6a-8b7f-1a2b3c4d5e${String(10 + i)}`;
        assert.strictEqual(send(store, id, `${GOOD} Номер ${i}`).status, 200);
    }
    assert.strictEqual(send(store, B, `${GOOD} Інший клієнт`).status, 429);
});

check('an identical resend is accepted silently and stored once', () => {
    const { store, advance } = fresh();
    send(store, A, GOOD);
    advance(LIMITS.perClientGapMs + 1000);
    const again = send(store, A, GOOD.toUpperCase());
    assert.strictEqual(again.status, 200);
    assert.strictEqual(again.duplicate, true);
    assert.strictEqual(store.list().total, 1);
});

check('read, unread, read-all and delete work', () => {
    const { store, advance } = fresh();
    send(store, A, GOOD);
    advance(LIMITS.perClientGapMs + 1000);
    send(store, B, `${GOOD} Другий`, { ipHash: 'ip2' });
    const [newest, oldest] = store.list().items;
    assert.ok(newest.createdAt > oldest.createdAt);
    store.update({ action: 'read', id: newest.id });
    assert.strictEqual(store.list().unread, 1);
    store.update({ action: 'unread', id: newest.id });
    store.update({ action: 'read-all' });
    assert.strictEqual(store.list().unread, 0);
    store.update({ action: 'delete', id: oldest.id });
    assert.strictEqual(store.list().total, 1);
    assert.strictEqual(store.update({ action: 'delete', id: 'x' }), false);
    assert.strictEqual(store.update({ action: 'nope', id: 1 }), false);
});

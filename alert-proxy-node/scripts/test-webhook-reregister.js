// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const {
    trackBroken,
    shouldReregister,
    buildWebhookUrl,
    run,
    BROKEN_HOLD_MS,
    SUCCESS_COOLDOWN_MS,
    FAILURE_COOLDOWN_MS,
} = require('../src/uaWebhookReregister');

const T0 = 1_800_000_000_000;
const MIN = 60 * 1000;

async function check(name, fn) {
    await fn();
    console.log(`PASS: ${name}`);
}

function simulate({ states, stepMs, lastAttemptAt = null, lastOk = false, send }) {
    let brokenSince = null;
    let attempt = lastAttemptAt;
    let ok = lastOk;
    const attempts = [];
    return (async () => {
        for (let i = 0; i < states.length; i++) {
            const now = T0 + i * stepMs;
            brokenSince = trackBroken(brokenSince, states[i], now);
            if (shouldReregister({ state: states[i], brokenSince, now, lastAttemptAt: attempt, lastOk: ok })) {
                attempt = now;
                const result = await run({ send, url: 'https://example.test/hook' });
                ok = result.ok;
                attempts.push({ at: i * stepMs, ok: result.ok, method: result.method });
            }
        }
        return attempts;
    })();
}

const okSend = async () => ({ ok: true, status: 200 });
const failSend = async () => ({ ok: false, status: 500 });

(async () => {
    await check('not before the broken state has lasted fifteen minutes', () => {
        const since = T0;
        assert.strictEqual(shouldReregister({ state: 'broken', brokenSince: since, now: T0 + BROKEN_HOLD_MS - 1, lastAttemptAt: null, lastOk: false }), false);
        assert.strictEqual(shouldReregister({ state: 'broken', brokenSince: since, now: T0 + BROKEN_HOLD_MS, lastAttemptAt: null, lastOk: false }), true);
    });

    await check('only the broken state triggers it', () => {
        ['healthy', 'suspect', 'unconfigured'].forEach((state) => {
            assert.strictEqual(shouldReregister({ state, brokenSince: T0, now: T0 + 60 * MIN, lastAttemptAt: null, lastOk: false }), false);
        });
        assert.strictEqual(shouldReregister({ state: 'broken', brokenSince: null, now: T0 + 60 * MIN, lastAttemptAt: null, lastOk: false }), false);
    });

    await check('broken since resets on healthy or suspect and restarts the fifteen minute hold', () => {
        let since = trackBroken(null, 'broken', T0);
        assert.strictEqual(since, T0);
        since = trackBroken(since, 'broken', T0 + 5 * MIN);
        assert.strictEqual(since, T0);
        since = trackBroken(since, 'suspect', T0 + 6 * MIN);
        assert.strictEqual(since, null);
        since = trackBroken(since, 'broken', T0 + 7 * MIN);
        assert.strictEqual(since, T0 + 7 * MIN);
        since = trackBroken(since, 'healthy', T0 + 8 * MIN);
        assert.strictEqual(since, null);
    });

    await check('six hour cooldown after a success', () => {
        const base = { state: 'broken', brokenSince: T0 - 10 * 60 * MIN, lastAttemptAt: T0, lastOk: true };
        assert.strictEqual(shouldReregister({ ...base, now: T0 + SUCCESS_COOLDOWN_MS - 1 }), false);
        assert.strictEqual(shouldReregister({ ...base, now: T0 + SUCCESS_COOLDOWN_MS }), true);
    });

    await check('thirty minute cooldown after a failure', () => {
        const base = { state: 'broken', brokenSince: T0 - 10 * 60 * MIN, lastAttemptAt: T0, lastOk: false };
        assert.strictEqual(shouldReregister({ ...base, now: T0 + FAILURE_COOLDOWN_MS - 1 }), false);
        assert.strictEqual(shouldReregister({ ...base, now: T0 + FAILURE_COOLDOWN_MS }), true);
    });

    await check('a restart keeps the stored cooldown even after the hold has passed again', () => {
        const restartAt = T0 + 2 * 60 * MIN;
        const brokenSince = restartAt - 20 * MIN;
        assert.strictEqual(shouldReregister({ state: 'broken', brokenSince, now: restartAt, lastAttemptAt: T0 + 90 * MIN, lastOk: true }), false);
        assert.strictEqual(shouldReregister({ state: 'broken', brokenSince, now: restartAt, lastAttemptAt: restartAt - SUCCESS_COOLDOWN_MS, lastOk: true }), true);
    });

    await check('it does not fire twice in a row and respects both cooldowns over time', async () => {
        const states = new Array(60 * 12).fill('broken');
        const attempts = await simulate({ states, stepMs: 15 * 1000, send: okSend });
        assert.strictEqual(attempts.length, 1);
        assert.strictEqual(attempts[0].at, BROKEN_HOLD_MS);
        assert.strictEqual(attempts[0].method, 'PATCH');

        const failing = await simulate({ states, stepMs: 15 * 1000, send: failSend });
        assert.strictEqual(failing.length >= 2, true);
        failing.slice(1).forEach((attempt, index) => {
            assert.strictEqual(attempt.at - failing[index].at >= FAILURE_COOLDOWN_MS, true);
        });
    });

    await check('a stored recent attempt blocks the first attempt after a restart', async () => {
        const states = new Array(80).fill('broken');
        const attempts = await simulate({ states, stepMs: 15 * 1000, lastAttemptAt: T0 - 60 * MIN, lastOk: true, send: okSend });
        assert.strictEqual(attempts.length, 0);
    });

    await check('patch is tried first and post only after 400, 404 or 405', async () => {
        const calls = [];
        const record = (answers) => async (method) => {
            calls.push(method);
            return answers[method];
        };
        let result = await run({ send: record({ PATCH: { ok: true, status: 200 } }), url: 'https://example.test/hook' });
        assert.deepStrictEqual(calls, ['PATCH']);
        assert.strictEqual(result.ok, true);

        for (const status of [400, 404, 405]) {
            calls.length = 0;
            result = await run({ send: record({ PATCH: { ok: false, status }, POST: { ok: true, status: 200 } }), url: 'https://example.test/hook' });
            assert.deepStrictEqual(calls, ['PATCH', 'POST']);
            assert.strictEqual(result.method, 'POST');
            assert.strictEqual(result.ok, true);
        }

        for (const status of [401, 429, 500, 502]) {
            calls.length = 0;
            result = await run({ send: record({ PATCH: { ok: false, status }, POST: { ok: true, status: 200 } }), url: 'https://example.test/hook' });
            assert.deepStrictEqual(calls, ['PATCH']);
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.status, status);
        }
    });

    await check('the request body url is exactly the configured one', async () => {
        const urls = [];
        await run({
            send: async (method, url) => {
                urls.push(url);
                return { ok: true, status: 200 };
            },
            url: buildWebhookUrl('https://alert-proxy-ua.duckdns.org/', 'secret-path'),
        });
        assert.deepStrictEqual(urls, ['https://alert-proxy-ua.duckdns.org/secret-path']);
        assert.strictEqual(buildWebhookUrl('https://a.test', '/x'), 'https://a.test/x');
        assert.strictEqual(buildWebhookUrl('https://a.test', ''), null);
        assert.strictEqual(buildWebhookUrl('', '/x'), null);
        const missing = await run({ send: okSend, url: null });
        assert.strictEqual(missing.ok, false);
    });
})().catch((err) => {
    console.error('FAIL:', err && err.message ? err.message : err);
    process.exit(1);
});

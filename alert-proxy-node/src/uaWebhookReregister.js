// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const BROKEN_HOLD_MS = 15 * 60 * 1000;
const SUCCESS_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 30 * 60 * 1000;
const FALLBACK_TO_POST_STATUSES = [400, 404, 405];

function trackBroken(brokenSince, healthState, now) {
    if (healthState !== 'broken') return null;
    return brokenSince === null || brokenSince === undefined ? now : brokenSince;
}

function shouldReregister({ state, brokenSince, now, lastAttemptAt, lastOk }) {
    if (state !== 'broken') return false;
    if (brokenSince === null || brokenSince === undefined) return false;
    if (now - brokenSince < BROKEN_HOLD_MS) return false;
    if (lastAttemptAt) {
        const cooldown = lastOk ? SUCCESS_COOLDOWN_MS : FAILURE_COOLDOWN_MS;
        if (now - lastAttemptAt < cooldown) return false;
    }
    return true;
}

function buildWebhookUrl(baseUrl, path) {
    if (!baseUrl || !path) return null;
    const base = String(baseUrl).replace(/\/+$/, '');
    const suffix = String(path).startsWith('/') ? String(path) : `/${path}`;
    return `${base}${suffix}`;
}

async function run({ send, url }) {
    if (!url) return { ok: false, status: 0, method: null, reason: 'no-url' };

    const patched = await send('PATCH', url);
    if (patched.ok) return { ok: true, status: patched.status, method: 'PATCH' };
    if (!FALLBACK_TO_POST_STATUSES.includes(patched.status)) return { ok: false, status: patched.status, method: 'PATCH' };

    const posted = await send('POST', url);
    return { ok: posted.ok, status: posted.status, method: 'POST' };
}

module.exports = {
    trackBroken,
    shouldReregister,
    buildWebhookUrl,
    run,
    BROKEN_HOLD_MS,
    SUCCESS_COOLDOWN_MS,
    FAILURE_COOLDOWN_MS,
};

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const DEFAULTS = {
    perWindow: 3,
    criticalPerWindow: 5,
    windowMs: 60 * 1000,
    digestDelayMs: 15 * 1000,
    digestCooldownMs: 30 * 1000,
};

function createThrottle({ onDigest, onSingle, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, ...overrides }) {
    const options = { ...DEFAULTS, ...overrides };
    const sentByKind = new Map();
    const queuedByKind = new Map();
    const timerByKind = new Map();
    const nextDigestAtByKind = new Map();

    function recentlySent(kind, at) {
        const sent = (sentByKind.get(kind) || []).filter((entry) => at - entry.at < options.windowMs);
        sentByKind.set(kind, sent);
        return sent;
    }

    function flush(kind) {
        timerByKind.delete(kind);
        const queued = queuedByKind.get(kind) || [];
        queuedByKind.set(kind, []);
        nextDigestAtByKind.set(kind, now() + options.digestCooldownMs);
        if (queued.length === 1) onSingle(kind, queued[0]);
        else if (queued.length > 1) onDigest(kind, queued);
    }

    function scheduleDigest(kind, at) {
        if (timerByKind.has(kind)) return;
        const wait = Math.max(options.digestDelayMs, (nextDigestAtByKind.get(kind) || 0) - at);
        const timer = setTimer(() => flush(kind), wait);
        if (timer && typeof timer.unref === 'function') timer.unref();
        timerByKind.set(kind, timer);
    }

    function submit(kind, entry) {
        const at = now();
        const sent = recentlySent(kind, at);
        const queued = queuedByKind.get(kind) || [];
        const regular = sent.filter((item) => !item.critical).length;
        const critical = sent.filter((item) => item.critical).length;

        const regularAllowed = !queued.length && regular < options.perWindow;
        const criticalAllowed = Boolean(entry.critical) && critical < options.criticalPerWindow;

        if (regularAllowed || criticalAllowed) {
            sent.push({ at, critical: !regularAllowed });
            return true;
        }

        queued.push(entry);
        queuedByKind.set(kind, queued);
        scheduleDigest(kind, at);
        return false;
    }

    function dispose() {
        timerByKind.forEach((timer) => clearTimer(timer));
        timerByKind.clear();
        queuedByKind.clear();
        sentByKind.clear();
        nextDigestAtByKind.clear();
    }

    return { submit, dispose };
}

module.exports = { createThrottle };

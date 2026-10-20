// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { levelRank } = require('./alertLevels');

const DEFAULTS = {
    staleOnFirstSightMs: 5 * 60 * 1000,
    hysteresisMs: 15 * 1000,
    hysteresisUpdates: 2,
    cooldownMs: 60 * 1000,
};

function knownLevel(level) {
    return level === 'red' || level === 'yellow' ? level : null;
}

function higherLevel(a, b) {
    return levelRank(b) > levelRank(a) ? b : a;
}

function sameSet(a, b) {
    if (a.length !== b.length) return false;
    const set = new Set(a);
    return b.every((value) => set.has(value));
}

function normalizeSig(sig) {
    return [...new Set((sig || []).filter(Boolean))].sort();
}

function entryFromItem(item, now) {
    const level = knownLevel(item.level);
    return {
        ...item.meta,
        startedAt: item.startedAt,
        level,
        maxLevel: level,
        sig: normalizeSig(item.sig),
        lastEventAt: now,
    };
}

function cloneEntry(entry) {
    return { ...entry, sig: entry.sig ? [...entry.sig] : entry.sig, pending: entry.pending ? { ...entry.pending } : undefined };
}

function evaluate(entry, item, now, options) {
    const current = knownLevel(item.level);
    const sig = normalizeSig(item.sig);
    const next = cloneEntry(entry);
    next.startedAt = item.startedAt || next.startedAt;
    Object.assign(next, item.meta);

    if (entry.level === undefined || entry.sig === undefined) {
        next.level = current;
        next.maxLevel = higherLevel(knownLevel(next.maxLevel), current);
        next.sig = sig;
        delete next.pending;
        return { entry: next, event: null, checkInMs: null };
    }

    if (entry.level === null && current !== null) {
        next.level = current;
        next.maxLevel = higherLevel(knownLevel(next.maxLevel), current);
        next.sig = sig;
        delete next.pending;
        return { entry: next, event: null, checkInMs: null };
    }

    if (current === null) {
        delete next.pending;
        return { entry: next, event: null, checkInMs: null };
    }

    const targetLevel = current;
    const levelChanged = targetLevel !== entry.level;
    const sigChanged = !sameSet(sig, entry.sig);

    if (!levelChanged && !sigChanged) {
        delete next.pending;
        return { entry: next, event: null, checkInMs: null };
    }

    const key = `${targetLevel}#${sig.join('&')}`;
    const pending = entry.pending && entry.pending.key === key
        ? { ...entry.pending, count: entry.pending.count + 1 }
        : { key, since: now, count: 1 };
    next.pending = pending;

    const heldMs = now - pending.since;
    const hysteresisOk = pending.count >= options.hysteresisUpdates && heldMs >= options.hysteresisMs;
    const escalating = levelChanged && levelRank(targetLevel) > levelRank(entry.level);
    const lastEventAt = entry.lastEventAt || 0;
    const cooldownLeft = options.cooldownMs - (now - lastEventAt);
    const cooldownOk = escalating || cooldownLeft <= 0;

    if (!hysteresisOk || !cooldownOk) {
        const waitHysteresis = hysteresisOk ? 0 : Math.max(options.hysteresisMs - heldMs, 1000);
        const waitCooldown = cooldownOk ? 0 : cooldownLeft;
        return { entry: next, event: null, checkInMs: Math.max(waitHysteresis, waitCooldown, 1000) };
    }

    const added = sig.filter((value) => !entry.sig.includes(value));
    const removed = entry.sig.filter((value) => !sig.includes(value));
    const from = entry.level;

    next.level = targetLevel;
    next.maxLevel = higherLevel(knownLevel(next.maxLevel), targetLevel);
    next.sig = sig;
    delete next.pending;

    let type = null;
    if (levelChanged) type = levelRank(targetLevel) > levelRank(from) ? 'escalate' : 'deescalate';
    else if (added.length) type = 'addThreat';

    if (!type) return { entry: next, event: null, checkInMs: null };

    next.lastEventAt = now;
    return {
        entry: next,
        event: { type, id: item.id, item, entry: next, from, to: targetLevel, added, removed },
        checkInMs: null,
    };
}

function diffAlerts(prevSnapshot, items, opts = {}) {
    const options = { ...DEFAULTS, ...opts };
    const now = options.now === undefined ? Date.now() : options.now;
    const prev = prevSnapshot instanceof Map ? prevSnapshot : new Map(Object.entries(prevSnapshot || {}));
    const nextSnapshot = new Map();
    const events = [];
    let nextCheckInMs = null;
    const currentIds = new Set();

    items.forEach((item) => {
        currentIds.add(item.id);
        const entry = prev.get(item.id);

        if (!entry) {
            const created = entryFromItem(item, now);
            nextSnapshot.set(item.id, created);
            const startedMs = item.startedAt ? new Date(item.startedAt).getTime() : NaN;
            const stale = Number.isFinite(startedMs) && now - startedMs > options.staleOnFirstSightMs;
            events.push({ type: 'start', id: item.id, item, entry: created, stale });
            return;
        }

        const result = evaluate(entry, item, now, options);
        nextSnapshot.set(item.id, result.entry);
        if (result.event) events.push(result.event);
        if (result.checkInMs !== null) nextCheckInMs = nextCheckInMs === null ? result.checkInMs : Math.min(nextCheckInMs, result.checkInMs);
    });

    prev.forEach((entry, id) => {
        if (currentIds.has(id)) return;
        events.push({ type: 'end', id, entry });
    });

    return { events, nextSnapshot, nextCheckInMs };
}

module.exports = { diffAlerts, DEFAULTS };

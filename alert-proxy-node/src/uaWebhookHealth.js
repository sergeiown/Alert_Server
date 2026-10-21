// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const CHRONIC_WINDOW_MS = 6 * 60 * 60 * 1000;
const CHRONIC_MISSES = 3;
const BROKEN_MIN_KEYS = 3;
const BROKEN_MIN_RATIO = 0.3;
const SUSPECT_MIN_KEYS = 2;
const SUSPECT_MIN_RATIO = 0.15;

function chronicKeys(history, now) {
    const silent = new Set();
    history.forEach((times, key) => {
        const recent = times.filter((at) => now - at <= CHRONIC_WINDOW_MS);
        if (recent.length >= CHRONIC_MISSES) silent.add(key);
    });
    return silent;
}

function classifyWebhook({ configured, misses, events, history, now }) {
    const silent = chronicKeys(history, now);
    const counted = misses.filter((miss) => !silent.has(miss.key));
    const distinct = new Set(counted.map((miss) => miss.key)).size;
    const total = events + distinct;
    const ratio = total ? distinct / total : 0;

    let state = 'healthy';
    if (!configured) state = 'unconfigured';
    else if (distinct >= BROKEN_MIN_KEYS && ratio >= BROKEN_MIN_RATIO) state = 'broken';
    else if (distinct >= SUSPECT_MIN_KEYS && ratio >= SUSPECT_MIN_RATIO) state = 'suspect';

    return { state, misses: counted.length, distinctKeys: distinct, events, silentKeys: [...silent].sort() };
}

function recordMiss(history, key, at) {
    const times = history.get(key) || [];
    times.push(at);
    history.set(key, times.filter((value) => at - value <= CHRONIC_WINDOW_MS));
}

function pruneHistory(history, now) {
    history.forEach((times, key) => {
        const recent = times.filter((at) => now - at <= CHRONIC_WINDOW_MS);
        if (recent.length) history.set(key, recent);
        else history.delete(key);
    });
}

module.exports = { classifyWebhook, recordMiss, pruneHistory, CHRONIC_WINDOW_MS, CHRONIC_MISSES };

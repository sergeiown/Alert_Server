// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { performance, monitorEventLoopDelay } = require('node:perf_hooks');

const SAMPLE_MS = 60 * 1000;
const HISTORY_SIZE = 60;
const TOP_TASKS = 10;
const MAX_TASKS = 80;

const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();

const tasks = new Map();
const history = [];
let lastElu = performance.eventLoopUtilization();
let startedAt = Date.now();

function round1(value) {
    return Math.round(value * 10) / 10;
}

function record(name, ms) {
    const key = tasks.has(name) || tasks.size < MAX_TASKS ? name : 'other';
    const entry = tasks.get(key) || { calls: 0, totalMs: 0, maxMs: 0 };
    entry.calls += 1;
    entry.totalMs += ms;
    if (ms > entry.maxMs) entry.maxMs = ms;
    tasks.set(key, entry);
}

function timed(name, fn) {
    const started = process.hrtime.bigint();
    try {
        return fn();
    } finally {
        record(name, Number(process.hrtime.bigint() - started) / 1e6);
    }
}

function sample() {
    const current = performance.eventLoopUtilization();
    const diff = performance.eventLoopUtilization(current, lastElu);
    lastElu = current;
    history.push(diff.utilization * 100);
    if (history.length > HISTORY_SIZE) history.shift();
}

function percentile(values, p) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function snapshot() {
    const total = performance.eventLoopUtilization();
    const busyMs = total.active;
    const list = [...tasks.entries()]
        .map(([name, entry]) => ({
            name,
            calls: entry.calls,
            totalMs: Math.round(entry.totalMs),
            avgMs: round1(entry.totalMs / entry.calls),
            maxMs: round1(entry.maxMs),
            shareOfBusyPercent: busyMs ? round1((entry.totalMs / busyMs) * 100) : 0,
        }))
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, TOP_TASKS);
    return {
        sinceMs: Date.now() - startedAt,
        eventLoop: {
            utilizationPercent: history.length ? round1(history[history.length - 1]) : null,
            averagePercent: history.length ? round1(history.reduce((sum, value) => sum + value, 0) / history.length) : null,
            p95Percent: history.length ? round1(percentile(history, 0.95)) : null,
            overallPercent: round1(total.utilization * 100),
            delayP99Ms: round1(delay.percentile(99) / 1e6),
            delayMaxMs: round1(delay.max / 1e6),
            samples: history.length,
        },
        busyMs: Math.round(busyMs),
        tasks: list,
    };
}

function reset() {
    tasks.clear();
    history.length = 0;
    delay.reset();
    lastElu = performance.eventLoopUtilization();
    startedAt = Date.now();
}

setInterval(sample, SAMPLE_MS).unref();

module.exports = { record, timed, snapshot, reset };

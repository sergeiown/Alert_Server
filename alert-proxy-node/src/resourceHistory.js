// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const SAMPLE_INTERVAL_MS = MINUTE_MS;
const RETENTION_MS = 8 * DAY_MS;
const WINDOW_MS = 7 * DAY_MS;
const MIN_COVERAGE_MS = 6 * HOUR_MS;
const IDLE_PERCENT = 20;
const THIN_MARGIN_PERCENT = 25;
const DEFAULT_BANDWIDTH_MBPS = 1000;

function round1(value) {
    return Math.round(value * 10) / 10;
}

function percentile(values, p) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
    return sorted[Math.max(0, index)];
}

function mean(values) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseNetDev(text) {
    let rx = 0;
    let tx = 0;
    let found = false;
    String(text)
        .split('\n')
        .slice(2)
        .forEach((line) => {
            const [name, rest] = line.split(':');
            if (!rest) return;
            const iface = name.trim();
            if (!iface || iface === 'lo') return;
            const fields = rest.trim().split(/\s+/).map(Number);
            if (fields.length < 9 || fields.some((value) => !Number.isFinite(value))) return;
            rx += fields[0];
            tx += fields[8];
            found = true;
        });
    return found ? { rx, tx } : null;
}

function createResourceHistory({ db, now = Date.now, readCpu, readMemoryPercent, readNetwork, bandwidthMbps = DEFAULT_BANDWIDTH_MBPS }) {
    db.exec('CREATE TABLE IF NOT EXISTS resource_samples (t INTEGER PRIMARY KEY, cpu REAL, mem REAL, net REAL)');
    const insertStmt = db.prepare('INSERT OR REPLACE INTO resource_samples (t, cpu, mem, net) VALUES (?, ?, ?, ?)');
    const pruneStmt = db.prepare('DELETE FROM resource_samples WHERE t < ?');
    const windowStmt = db.prepare('SELECT t, cpu, mem, net FROM resource_samples WHERE t >= ? ORDER BY t');

    let lastCpu = readCpu();
    let lastNet = readNetwork ? readNetwork() : null;
    let lastAt = now();

    function sample() {
        const current = now();
        const cpu = readCpu();
        const idleDelta = cpu.idle - lastCpu.idle;
        const totalDelta = cpu.total - lastCpu.total;
        lastCpu = cpu;

        const network = readNetwork ? readNetwork() : null;
        let netPercent = null;
        const seconds = (current - lastAt) / 1000;
        if (network && lastNet && seconds > 0) {
            const bits = (network.rx - lastNet.rx + (network.tx - lastNet.tx)) * 8;
            if (bits >= 0) netPercent = Math.min(100, (bits / seconds / (bandwidthMbps * 1e6)) * 100);
        }
        lastNet = network;
        lastAt = current;

        if (totalDelta <= 0) return null;
        const row = {
            t: current,
            cpu: Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)),
            mem: readMemoryPercent(),
            net: netPercent,
        };
        insertStmt.run(row.t, row.cpu, row.mem, row.net);
        pruneStmt.run(current - RETENTION_MS);
        return row;
    }

    function getIdleRisk() {
        const current = now();
        const rows = windowStmt.all(current - WINDOW_MS);
        const coverageMs = rows.length ? rows[rows.length - 1].t - rows[0].t : 0;
        const base = { threshold: IDLE_PERCENT, windowDays: 7, coverageHours: round1(coverageMs / HOUR_MS), samples: rows.length };
        if (coverageMs < MIN_COVERAGE_MS) return { ...base, state: 'collecting' };

        const cpuP95 = percentile(rows.map((row) => row.cpu).filter((v) => v !== null), 0.95);
        const memoryMean = mean(rows.map((row) => row.mem).filter((v) => v !== null));
        const networkValues = rows.map((row) => row.net).filter((v) => v !== null);
        const networkMean = networkValues.length ? mean(networkValues) : null;

        const metrics = [
            { key: 'cpu', value: cpuP95 },
            { key: 'memory', value: memoryMean },
            { key: 'network', value: networkMean },
        ].filter((metric) => metric.value !== null);
        const saving = metrics.filter((metric) => metric.value >= IDLE_PERCENT).map((metric) => metric.key);
        const atRisk = metrics.length > 0 && saving.length === 0;
        const thin = !atRisk && metrics.filter((metric) => metric.value >= IDLE_PERCENT && metric.value < THIN_MARGIN_PERCENT).length === saving.length;

        return {
            ...base,
            state: atRisk ? 'at-risk' : 'safe',
            cpuP95: cpuP95 === null ? null : round1(cpuP95),
            memoryMean: memoryMean === null ? null : round1(memoryMean),
            networkMean: networkMean === null ? null : round1(networkMean),
            saving,
            thin,
        };
    }

    return { sample, getIdleRisk };
}

module.exports = { createResourceHistory, percentile, mean, parseNetDev, SAMPLE_INTERVAL_MS, IDLE_PERCENT, THIN_MARGIN_PERCENT, MIN_COVERAGE_MS };

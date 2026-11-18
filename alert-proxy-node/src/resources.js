// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('node:fs');

const MB = 1024 * 1024;

const LIMITS = {
    loadPerCore: 0.7,
    cpuPressurePct: 25,
    availableBytes: 300 * MB,
    swapUsedBytes: 500 * MB,
};

function readText(file) {
    try {
        return fs.readFileSync(file, 'utf8');
    } catch (err) {
        return null;
    }
}

function parseMeminfo(text) {
    if (!text) return null;
    const bytes = (key) => {
        const match = new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(text);
        return match ? Number(match[1]) * 1024 : null;
    };
    return { totalBytes: bytes('MemTotal'), availableBytes: bytes('MemAvailable'), swapTotalBytes: bytes('SwapTotal'), swapFreeBytes: bytes('SwapFree') };
}

function parsePressure(text) {
    const match = /^some avg10=([\d.]+) avg60=([\d.]+) avg300=([\d.]+)/m.exec(text || '');
    return match ? { avg10: Number(match[1]), avg60: Number(match[2]), avg300: Number(match[3]) } : null;
}

function parseOomKills(text) {
    const match = /^oom_kill (\d+)/m.exec(text || '');
    return match ? Number(match[1]) : null;
}

function readResources(read = readText) {
    const mem = parseMeminfo(read('/proc/meminfo'));
    return {
        availableBytes: mem ? mem.availableBytes : null,
        swapUsedBytes: mem && mem.swapTotalBytes !== null && mem.swapFreeBytes !== null ? mem.swapTotalBytes - mem.swapFreeBytes : null,
        swapTotalBytes: mem ? mem.swapTotalBytes : null,
        cpuPressure: parsePressure(read('/proc/pressure/cpu')),
        memoryPressure: parsePressure(read('/proc/pressure/memory')),
        oomKills: parseOomKills(read('/proc/vmstat')),
    };
}

function resourceWarnings(resources, { loadAvg5 = null, cpuCount = 1 } = {}) {
    const warnings = [];
    if (loadAvg5 !== null && loadAvg5 / Math.max(1, cpuCount) > LIMITS.loadPerCore) warnings.push({ key: 'load', value: Math.round((loadAvg5 / Math.max(1, cpuCount)) * 100) / 100, limit: LIMITS.loadPerCore });
    if (resources.cpuPressure && resources.cpuPressure.avg300 > LIMITS.cpuPressurePct) warnings.push({ key: 'cpuPressure', value: resources.cpuPressure.avg300, limit: LIMITS.cpuPressurePct });
    if (resources.availableBytes !== null && resources.availableBytes < LIMITS.availableBytes) warnings.push({ key: 'memory', value: resources.availableBytes, limit: LIMITS.availableBytes });
    if (resources.swapUsedBytes !== null && resources.swapUsedBytes > LIMITS.swapUsedBytes) warnings.push({ key: 'swap', value: resources.swapUsedBytes, limit: LIMITS.swapUsedBytes });
    if (resources.oomKills !== null && resources.oomKills > 0) warnings.push({ key: 'oom', value: resources.oomKills, limit: 0 });
    return warnings;
}

module.exports = { LIMITS, parseMeminfo, parsePressure, parseOomKills, readResources, resourceWarnings };

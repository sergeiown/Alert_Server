// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const os = require('node:os');
const fs = require('node:fs');
const { DATA_DIR } = require('./config');

function cpuUsagePercentSample() {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    cpus.forEach((cpu) => {
        Object.values(cpu.times).forEach((t) => (total += t));
        idle += cpu.times.idle;
    });
    return { idle, total };
}

let lastCpuSample = cpuUsagePercentSample();

function sampleCpuPercent() {
    const current = cpuUsagePercentSample();
    const idleDelta = current.idle - lastCpuSample.idle;
    const totalDelta = current.total - lastCpuSample.total;
    lastCpuSample = current;
    if (totalDelta <= 0) return null;
    return Math.round((1 - idleDelta / totalDelta) * 1000) / 10;
}

function diskUsage() {
    try {
        const stats = fs.statfsSync(DATA_DIR);
        const totalBytes = stats.blocks * stats.bsize;
        const freeBytes = stats.bfree * stats.bsize;
        const usedBytes = totalBytes - freeBytes;
        return { totalBytes, freeBytes, usedBytes, usedPercent: Math.round((usedBytes / totalBytes) * 1000) / 10 };
    } catch (err) {
        return null;
    }
}

function processMemory() {
    const usage = process.memoryUsage();
    const heapLimitBytes = require('node:v8').getHeapStatistics().heap_size_limit;
    return {
        rssBytes: usage.rss,
        heapUsedBytes: usage.heapUsed,
        heapTotalBytes: usage.heapTotal,
        heapLimitBytes,
        externalBytes: usage.external,
        arrayBuffersBytes: usage.arrayBuffers,
    };
}

function getSystemMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
        cpuLoadAvg: os.loadavg(),
        cpuCount: os.cpus().length,
        cpuUsagePercent: sampleCpuPercent(),
        memory: {
            totalBytes: totalMem,
            freeBytes: freeMem,
            usedBytes: usedMem,
            usedPercent: Math.round((usedMem / totalMem) * 1000) / 10,
        },
        disk: diskUsage(),
        process: processMemory(),
        uptimeSec: Math.round(process.uptime()),
        nodeVersion: process.version,
        platform: `${os.platform()}/${os.arch()}`,
    };
}

module.exports = { getSystemMetrics };

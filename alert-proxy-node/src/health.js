// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const RESOURCE_WARN_PERCENT = 80;
const RESOURCE_CRIT_PERCENT = 90;
const HEAP_WARN_PERCENT = 60;
const HEAP_CRIT_PERCENT = 85;
const ACTIVE_STALE_MS = 90 * 1000;
const NEPTUN_STREAM_DOWN_MS = 5 * 60 * 1000;
const NEPTUN_ALERTS_STALE_MS = 5 * 60 * 1000;
const BACKUP_STALE_MS = 36 * 60 * 60 * 1000;
const OCCUPIED_STALE_MS = 14 * 60 * 60 * 1000;

let previousLevels = new Map();
const SEVERITY = { info: 0, warn: 1, crit: 2 };

function evaluate(status, flags) {
    const issues = [];
    const add = (level, code, message) => issues.push({ level, code, message });

    if (flags.alertsConfigured) {
        if (status.active.currentError) {
            add('crit', 'alertsinua-error', `alerts.in.ua returns ${status.active.currentError.status}`);
        } else if (status.active.cacheAgeMs === null || status.active.cacheAgeMs > ACTIVE_STALE_MS) {
            add('crit', 'alertsinua-stale', 'active alerts cache is stale');
        }
        if (status.active.percentOfSoftLimit >= 100) {
            add('warn', 'alertsinua-rate', 'request rate is over the alerts.in.ua soft limit');
        }
    } else {
        add('crit', 'alertsinua-no-token', 'ALERTS_TOKEN is not configured');
    }

    if (!flags.ukraineAlarmConfigured) add('info', 'ukrainealarm-no-token', 'UkraineAlarm token is not configured');

    const neptun = status.neptun;
    if (!neptun.stream.connected && (neptun.stream.lastMessageAgeMs === null || neptun.stream.lastMessageAgeMs > NEPTUN_STREAM_DOWN_MS)) {
        add('warn', 'neptun-stream', 'Neptun stream is down');
    }
    if (neptun.alerts.currentError || neptun.alerts.cacheAgeMs === null || neptun.alerts.cacheAgeMs > NEPTUN_ALERTS_STALE_MS) {
        add('warn', 'neptun-alerts', 'Neptun alerts are stale or failing');
    }

    if (status.occupied.cacheAgeMs === null || status.occupied.cacheAgeMs > OCCUPIED_STALE_MS) {
        add('warn', 'occupied-stale', 'Occupied territory data (DeepState) is stale');
    }

    const sys = status.system;
    const checkResource = (code, label, percent, warnAt, critAt) => {
        if (percent >= critAt) add('crit', code, `${label} at ${percent}%`);
        else if (percent >= warnAt) add('warn', code, `${label} at ${percent}%`);
    };
    checkResource('cpu', 'CPU', sys.cpuUsagePercent, RESOURCE_WARN_PERCENT, RESOURCE_CRIT_PERCENT);
    checkResource('memory', 'memory', sys.memory.usedPercent, RESOURCE_WARN_PERCENT, RESOURCE_CRIT_PERCENT);
    checkResource('disk', 'disk', sys.disk.usedPercent, RESOURCE_WARN_PERCENT, RESOURCE_CRIT_PERCENT);
    if (sys.process && sys.process.heapLimitBytes) {
        const heapPercent = Math.round((sys.process.heapUsedBytes / sys.process.heapLimitBytes) * 1000) / 10;
        checkResource('heap', 'server process heap', heapPercent, HEAP_WARN_PERCENT, HEAP_CRIT_PERCENT);
    }

    if (status.backup.ageMs === null || status.backup.ageMs > BACKUP_STALE_MS) {
        add('warn', 'backup', 'no recent database backup');
    }

    return issues;
}

function logTransitions(issues) {
    const current = new Map(issues.filter((i) => i.level !== 'info').map((i) => [i.code, i.level]));
    issues.forEach((issue) => {
        if (issue.level === 'info') return;
        const before = previousLevels.get(issue.code);
        if (before === undefined || SEVERITY[issue.level] > SEVERITY[before]) console.warn(`[health] ${issue.level}: ${issue.message}`);
    });
    previousLevels.forEach((level, code) => {
        if (!current.has(code)) console.log(`[health] recovered: ${code}`);
    });
    previousLevels = current;
}

module.exports = { evaluate, logTransitions };

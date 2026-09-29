// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const RESOURCE_WARN_PERCENT = 85;
const ACTIVE_STALE_MS = 90 * 1000;
const NEPTUN_STREAM_DOWN_MS = 5 * 60 * 1000;
const NEPTUN_ALERTS_STALE_MS = 5 * 60 * 1000;
const BACKUP_STALE_MS = 36 * 60 * 60 * 1000;
const OCCUPIED_STALE_MS = 14 * 60 * 60 * 1000;

let previousCodes = new Set();

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
    if (sys.cpuUsagePercent >= RESOURCE_WARN_PERCENT) add('warn', 'cpu', `CPU at ${sys.cpuUsagePercent}%`);
    if (sys.memory.usedPercent >= RESOURCE_WARN_PERCENT) add('warn', 'memory', `memory at ${sys.memory.usedPercent}%`);
    if (sys.disk.usedPercent >= RESOURCE_WARN_PERCENT) add('warn', 'disk', `disk at ${sys.disk.usedPercent}%`);

    if (status.backup.ageMs === null || status.backup.ageMs > BACKUP_STALE_MS) {
        add('warn', 'backup', 'no recent database backup');
    }

    return issues;
}

function logTransitions(issues) {
    const current = new Set(issues.filter((i) => i.level !== 'info').map((i) => i.code));
    issues.forEach((issue) => {
        if (issue.level !== 'info' && !previousCodes.has(issue.code)) console.warn(`[health] ${issue.level}: ${issue.message}`);
    });
    previousCodes.forEach((code) => {
        if (!current.has(code)) console.log(`[health] recovered: ${code}`);
    });
    previousCodes = current;
}

module.exports = { evaluate, logTransitions };

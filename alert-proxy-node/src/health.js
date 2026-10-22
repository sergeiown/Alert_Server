// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const RESOURCE_WARN_PERCENT = 80;
const RESOURCE_CRIT_PERCENT = 90;
const HEAP_WARN_PERCENT = 60;
const HEAP_CRIT_PERCENT = 85;
const ACTIVE_STALE_MS = 90 * 1000;
const REREGISTER_REPORT_MS = 6 * 60 * 60 * 1000;
const UKRAINEALARM_SNAPSHOT_WARN_MS = 6 * 60 * 1000;
const UKRAINEALARM_SNAPSHOT_CRIT_MS = 20 * 60 * 1000;
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

    if (!flags.ukraineAlarmConfigured) {
        add('info', 'ukrainealarm-no-token', 'UkraineAlarm token is not configured');
    } else if (status.ukraineAlarm.snapshotAgeMs !== null) {
        if (status.ukraineAlarm.snapshotAgeMs > UKRAINEALARM_SNAPSHOT_CRIT_MS) add('crit', 'ukrainealarm-stale', 'UkraineAlarm snapshot has not refreshed for over 20 minutes');
        else if (status.ukraineAlarm.snapshotAgeMs > UKRAINEALARM_SNAPSHOT_WARN_MS) add('warn', 'ukrainealarm-stale', 'UkraineAlarm snapshot is stale');
    }

    if (flags.ukraineAlarmConfigured && status.ukraineAlarm.webhook) {
        const webhook = status.ukraineAlarm.webhook;
        if (webhook.state === 'broken') {
            add('crit', 'ukrainealarm-webhook', `UkraineAlarm webhook looks broken (${webhook.missesLast30Min} missed events in 30 min), relying on snapshots`);
        } else if (webhook.state === 'suspect') {
            add('warn', 'ukrainealarm-webhook', `UkraineAlarm webhook missed ${webhook.missesLast30Min} event(s) in 30 min`);
        }

        const reRegister = webhook.reRegister;
        if (reRegister && reRegister.lastAt && Date.now() - reRegister.lastAt < REREGISTER_REPORT_MS) {
            if (reRegister.lastOk) {
                add('info', 'ukrainealarm-webhook-reregistered', `UkraineAlarm webhook was re-registered automatically (${reRegister.method}, status ${reRegister.lastStatus})`);
            } else if (reRegister.lastStatus !== null) {
                add('warn', 'ukrainealarm-webhook-reregister-failed', `UkraineAlarm webhook re-registration failed (status ${reRegister.lastStatus})`);
            }
        }
    }

    const merged = status.merged;
    if (merged) {
        if (!merged.ready) {
            add('warn', 'merged-not-ready', 'merged alert stream has no official source data yet');
        } else if (merged.sources) {
            const notOk = Object.entries(merged.sources).filter(([, source]) => source.state !== 'ok');
            const officialNotOk = ['ia', 'ua'].filter((key) => merged.sources[key].state !== 'ok');
            if (officialNotOk.length === 2) {
                add('crit', 'merged-official-down', 'both alerts.in.ua and UkraineAlarm are not fresh, merged stream is degraded');
            } else if (notOk.length) {
                add('warn', 'merged-degraded', `merged alert stream is degraded: ${notOk.map(([key, source]) => `${key} ${source.state}`).join(', ')}`);
            }
        }
    }

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
    checkResource('cpu', 'CPU', sys.cpuAveragePercent, RESOURCE_WARN_PERCENT, RESOURCE_CRIT_PERCENT);
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

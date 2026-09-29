// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { db } = require('./store');
const lib = require('./lib');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HISTORY_DAYS = 30;
const TOP_USERS = 10;
const RETENTION_DAYS = 120;

db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_seen INTEGER NOT NULL,
    first_day TEXT NOT NULL,
    last_seen INTEGER NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    version TEXT
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen)');
db.exec('CREATE TABLE IF NOT EXISTS user_days (day TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (day, id))');
db.exec(`CREATE TABLE IF NOT EXISTS route_hits (
    day TEXT NOT NULL,
    hour INTEGER NOT NULL,
    route TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, hour, route)
)`);

const upsertUser = db.prepare(`INSERT INTO users (id, first_seen, first_day, last_seen, requests, version)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET
        last_seen = excluded.last_seen,
        requests = users.requests + 1,
        version = COALESCE(excluded.version, users.version)`);
const upsertDay = db.prepare('INSERT OR IGNORE INTO user_days (day, id) VALUES (?, ?)');
const upsertHit = db.prepare(`INSERT INTO route_hits (day, hour, route, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(day, hour, route) DO UPDATE SET count = count + 1`);

const peak = { day: null, connections: 0 };

function kyivHourNow(date) {
    return lib.kyivHour(date.toISOString());
}

function record(hashedId, route, version) {
    const now = new Date();
    const day = lib.kyivDateKey(now);
    const safeVersion = version && /^[0-9A-Za-z._-]{1,20}$/.test(version) ? version : null;

    upsertUser.run(hashedId, now.getTime(), day, now.getTime(), safeVersion);
    upsertDay.run(day, hashedId);
    upsertHit.run(day, kyivHourNow(now), route);
}

async function recordRequest(ip, route, version) {
    record(await lib.hashIp(ip), route, version);
}

function notePeak(totalConnections) {
    const day = lib.kyivDateKey(new Date());
    if (peak.day !== day) {
        peak.day = day;
        peak.connections = 0;
    }
    if (totalConnections > peak.connections) peak.connections = totalConnections;
}

function prune() {
    const cutoffDay = lib.kyivDateKey(new Date(Date.now() - RETENTION_DAYS * DAY_MS));
    db.prepare('DELETE FROM route_hits WHERE day < ?').run(cutoffDay);
    db.prepare('DELETE FROM user_days WHERE day < ?').run(cutoffDay);
}

function getStats(currentConnections) {
    const now = Date.now();
    const today = lib.kyivDateKey(new Date(now));
    const one = (sql, ...params) => db.prepare(sql).get(...params);
    const all = (sql, ...params) => db.prepare(sql).all(...params);

    const total = one('SELECT COUNT(*) AS c FROM users').c;
    const activeSince = (ms) => one('SELECT COUNT(*) AS c FROM users WHERE last_seen >= ?', now - ms).c;
    const todayActive = one('SELECT COUNT(*) AS c FROM user_days WHERE day = ?', today).c;
    const newToday = one('SELECT COUNT(*) AS c FROM users WHERE first_day = ?', today).c;
    const active30 = activeSince(30 * DAY_MS);
    const multiDay = one('SELECT COUNT(*) AS c FROM (SELECT id FROM user_days GROUP BY id HAVING COUNT(*) >= 2)').c;
    const avgDays = one('SELECT AVG(n) AS a FROM (SELECT COUNT(*) AS n FROM user_days GROUP BY id)').a;

    const sinceDay = lib.kyivDateKey(new Date(now - (HISTORY_DAYS - 1) * DAY_MS));
    const daily = all(
        `SELECT d.day AS day, COUNT(*) AS active,
            SUM(CASE WHEN u.first_day = d.day THEN 1 ELSE 0 END) AS fresh
         FROM user_days d JOIN users u ON u.id = d.id
         WHERE d.day >= ? GROUP BY d.day ORDER BY d.day`,
        sinceDay
    ).map((row) => ({ day: row.day, active: row.active, newUsers: row.fresh }));

    const hourlyRows = all('SELECT hour, SUM(count) AS c FROM route_hits WHERE day = ? GROUP BY hour', today);
    const hourly = Array.from({ length: 24 }, (_, hour) => {
        const row = hourlyRows.find((r) => r.hour === hour);
        return row ? row.c : 0;
    });

    const routes = all(
        'SELECT route, SUM(count) AS c FROM route_hits WHERE day = ? GROUP BY route ORDER BY c DESC LIMIT 12',
        today
    ).map((row) => ({ route: row.route, count: row.c }));

    const versions = all(
        `SELECT COALESCE(version, 'unknown') AS version, COUNT(*) AS c FROM users
         WHERE last_seen >= ? GROUP BY COALESCE(version, 'unknown') ORDER BY c DESC LIMIT 12`,
        now - 7 * DAY_MS
    ).map((row) => ({ version: row.version, users: row.c }));

    const top = all('SELECT id, first_seen, last_seen, requests, version FROM users ORDER BY requests DESC LIMIT ?', TOP_USERS).map((row) => ({
        id: row.id,
        firstSeen: new Date(row.first_seen).toISOString(),
        lastSeen: new Date(row.last_seen).toISOString(),
        requests: row.requests,
        version: row.version,
    }));

    notePeak(currentConnections);

    return {
        generatedAt: new Date(now).toISOString(),
        totals: {
            allTime: total,
            today: todayActive,
            newToday,
            returningToday: Math.max(0, todayActive - newToday),
            lastHour: activeSince(HOUR_MS),
            last24h: activeSince(DAY_MS),
            last7d: activeSince(7 * DAY_MS),
            last30d: active30,
        },
        engagement: {
            multiDayUsers: multiDay,
            multiDayShare: total ? Math.round((multiDay / total) * 100) : 0,
            avgActiveDays: avgDays ? Math.round(avgDays * 10) / 10 : 0,
            stickiness: active30 ? Math.round((todayActive / active30) * 100) : 0,
        },
        connections: { now: currentConnections, peakToday: peak.day === today ? peak.connections : currentConnections },
        daily,
        hourlyRequestsToday: hourly,
        routesToday: routes,
        versions,
        topUsers: top,
    };
}

module.exports = { record, recordRequest, notePeak, prune, getStats };

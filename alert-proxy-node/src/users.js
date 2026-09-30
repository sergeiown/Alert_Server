// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { db } = require('./store');
const lib = require('./lib');
const geoip = require('./geoip');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HISTORY_DAYS = 30;
const RETENTION_DAYS = 120;

db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_seen INTEGER NOT NULL,
    first_day TEXT NOT NULL,
    last_seen INTEGER NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    version TEXT
)`);
if (!db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'country')) {
    db.exec('ALTER TABLE users ADD COLUMN country TEXT');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen)');
db.exec('CREATE TABLE IF NOT EXISTS user_days (day TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (day, id))');
if (!db.prepare('PRAGMA table_info(user_days)').all().some((column) => column.name === 'version')) {
    db.exec('ALTER TABLE user_days ADD COLUMN version TEXT');
}
db.exec(`CREATE TABLE IF NOT EXISTS version_daily (
    day TEXT NOT NULL,
    version TEXT NOT NULL,
    users INTEGER NOT NULL,
    PRIMARY KEY (day, version)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS route_hits (
    day TEXT NOT NULL,
    hour INTEGER NOT NULL,
    route TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, hour, route)
)`);

const upsertUser = db.prepare(`INSERT INTO users (id, first_seen, first_day, last_seen, requests, version, country)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        last_seen = excluded.last_seen,
        requests = users.requests + 1,
        version = COALESCE(excluded.version, users.version),
        country = COALESCE(excluded.country, users.country)`);
const upsertDay = db.prepare(`INSERT INTO user_days (day, id, version) VALUES (?, ?, ?)
    ON CONFLICT(day, id) DO UPDATE SET version = COALESCE(excluded.version, user_days.version)`);
const upsertHit = db.prepare(`INSERT INTO route_hits (day, hour, route, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(day, hour, route) DO UPDATE SET count = count + 1`);

const peak = { day: null, connections: 0 };

function kyivHourNow(date) {
    return lib.kyivHour(date.toISOString());
}

function record(hashedId, route, version, country) {
    const now = new Date();
    const day = lib.kyivDateKey(now);
    const safeVersion = version && /^[0-9A-Za-z._-]{1,20}$/.test(version) ? version : null;

    const safeCountry = country && /^[A-Z]{2}$/.test(country) && country !== 'ZZ' ? country : null;

    upsertUser.run(hashedId, now.getTime(), day, now.getTime(), safeVersion, safeCountry);
    upsertDay.run(day, hashedId, safeVersion);
    upsertHit.run(day, kyivHourNow(now), route);
}

async function recordRequest(ip, route, version) {
    record(await lib.hashIp(ip), route, version, geoip.lookup(ip));
}

function recordHit(route) {
    const now = new Date();
    upsertHit.run(lib.kyivDateKey(now), kyivHourNow(now), route);
}

function notePeak(totalConnections) {
    const day = lib.kyivDateKey(new Date());
    if (peak.day !== day) {
        peak.day = day;
        peak.connections = 0;
    }
    if (totalConnections > peak.connections) peak.connections = totalConnections;
}

const VERSION_HISTORY_DAYS = 60;
const VERSION_RETENTION_DAYS = 730;

function snapshotVersions(sinceDay) {
    const rows = db
        .prepare("SELECT day, COALESCE(version, 'unknown') AS version, COUNT(*) AS users FROM user_days WHERE day >= ? GROUP BY day, COALESCE(version, 'unknown')")
        .all(sinceDay);
    const insert = db.prepare('INSERT OR REPLACE INTO version_daily (day, version, users) VALUES (?, ?, ?)');
    db.exec('BEGIN');
    try {
        rows.forEach((row) => insert.run(row.day, row.version, row.users));
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

function getVersionHistory() {
    const now = Date.now();
    snapshotVersions(lib.kyivDateKey(new Date(now - DAY_MS)));

    const sinceDay = lib.kyivDateKey(new Date(now - (VERSION_HISTORY_DAYS - 1) * DAY_MS));
    const rows = db.prepare('SELECT day, version, users FROM version_daily WHERE day >= ? ORDER BY day').all(sinceDay);

    const byDay = new Map();
    const totals = new Map();
    rows.forEach((row) => {
        if (!byDay.has(row.day)) byDay.set(row.day, {});
        byDay.get(row.day)[row.version] = row.users;
        totals.set(row.version, (totals.get(row.version) || 0) + row.users);
    });

    return {
        versions: Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([version]) => version),
        days: Array.from(byDay.entries()).map(([day, versions]) => ({ day, versions })),
    };
}

function prune() {
    snapshotVersions('0000-00-00');
    db.prepare('DELETE FROM version_daily WHERE day < ?').run(lib.kyivDateKey(new Date(Date.now() - VERSION_RETENTION_DAYS * DAY_MS)));
    const cutoffDay = lib.kyivDateKey(new Date(Date.now() - RETENTION_DAYS * DAY_MS));
    db.prepare('DELETE FROM route_hits WHERE day < ?').run(cutoffDay);
    db.prepare('DELETE FROM user_days WHERE day < ?').run(cutoffDay);
}

function getStats(currentConnections, connectedUsers) {
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

    const versionTotals = all("SELECT COALESCE(version, 'unknown') AS version, COUNT(*) AS c FROM users GROUP BY COALESCE(version, 'unknown') ORDER BY c DESC").map((row) => ({
        version: row.version,
        users: row.c,
    }));

    const countryRows = (sql, ...params) =>
        all(sql, ...params).map((row) => ({ code: row.country || 'unknown', users: row.c }));
    const countries = {
        today: countryRows(
            `SELECT u.country AS country, COUNT(*) AS c FROM user_days d JOIN users u ON u.id = d.id
             WHERE d.day = ? GROUP BY u.country ORDER BY c DESC LIMIT 15`,
            today
        ),
        last7d: countryRows(
            'SELECT country, COUNT(*) AS c FROM users WHERE last_seen >= ? GROUP BY country ORDER BY c DESC LIMIT 15',
            now - 7 * DAY_MS
        ),
        allTime: countryRows('SELECT country, COUNT(*) AS c FROM users GROUP BY country ORDER BY c DESC LIMIT 15'),
    };

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
        connections: { now: currentConnections, users: connectedUsers || 0, peakToday: peak.day === today ? peak.connections : currentConnections },
        daily,
        hourlyRequestsToday: hourly,
        routesToday: routes,
        versionTotals,
        countries,
        versionHistory: getVersionHistory(),
    };
}

function getUserList() {
    return db
        .prepare(
            `SELECT u.id AS id, u.first_seen AS first_seen, u.last_seen AS last_seen, u.requests AS requests, u.version AS version, u.country AS country,
                (SELECT COUNT(*) FROM user_days d WHERE d.id = u.id) AS active_days
             FROM users u ORDER BY u.last_seen DESC LIMIT 20000`
        )
        .all()
        .map((row) => ({
            id: row.id,
            country: row.country,
            version: row.version,
            activeDays: row.active_days,
            requests: row.requests,
            firstSeen: new Date(row.first_seen).toISOString(),
            lastSeen: new Date(row.last_seen).toISOString(),
        }));
}

module.exports = { record, recordRequest, recordHit, notePeak, prune, getStats, getUserList };

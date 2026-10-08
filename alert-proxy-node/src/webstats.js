// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const crypto = require('node:crypto');
const { db } = require('./store');
const lib = require('./lib');
const geoip = require('./geoip');

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;
const RETENTION_DAYS = 365;
const LANGUAGES = new Set(['uk', 'en']);

db.exec(`CREATE TABLE IF NOT EXISTS web_days (
    day TEXT PRIMARY KEY,
    visitors INTEGER NOT NULL DEFAULT 0,
    sessions INTEGER NOT NULL DEFAULT 0,
    peak_ws INTEGER NOT NULL DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS web_country_days (
    day TEXT NOT NULL,
    country TEXT NOT NULL,
    visitors INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, country)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS web_lang_days (
    day TEXT NOT NULL,
    lang TEXT NOT NULL,
    visitors INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, lang)
)`);

const ensureDay = db.prepare('INSERT OR IGNORE INTO web_days (day) VALUES (?)');
const addVisitor = db.prepare('UPDATE web_days SET visitors = visitors + 1 WHERE day = ?');
const addSession = db.prepare('UPDATE web_days SET sessions = sessions + 1 WHERE day = ?');
const raisePeak = db.prepare('UPDATE web_days SET peak_ws = MAX(peak_ws, ?) WHERE day = ?');
const addCountry = db.prepare(`INSERT INTO web_country_days (day, country, visitors) VALUES (?, ?, 1)
    ON CONFLICT(day, country) DO UPDATE SET visitors = visitors + 1`);
const addLanguage = db.prepare(`INSERT INTO web_lang_days (day, lang, visitors) VALUES (?, ?, 1)
    ON CONFLICT(day, lang) DO UPDATE SET visitors = visitors + 1`);

let currentDay = null;
let salt = null;
let seenToday = new Set();
let peakToday = 0;

function rotate() {
    const day = lib.kyivDateKey(new Date());
    if (day !== currentDay) {
        currentDay = day;
        salt = crypto.randomBytes(16);
        seenToday = new Set();
        peakToday = 0;
        ensureDay.run(day);
    }
    return day;
}

function recordVisitor(ip, language) {
    const day = rotate();
    const hash = crypto.createHash('sha256').update(salt).update(String(ip)).digest('hex').slice(0, 16);
    if (seenToday.has(hash)) return;
    seenToday.add(hash);

    addVisitor.run(day);
    addCountry.run(day, geoip.lookup(ip) || 'unknown');
    addLanguage.run(day, LANGUAGES.has(language) ? language : 'other');
}

function recordSession() {
    addSession.run(rotate());
}

function notePeak(connections) {
    const day = rotate();
    if (connections > peakToday) {
        peakToday = connections;
        raisePeak.run(connections, day);
    }
}

function prune() {
    const cutoff = lib.kyivDateKey(new Date(Date.now() - RETENTION_DAYS * DAY_MS));
    ['web_days', 'web_country_days', 'web_lang_days'].forEach((table) => db.prepare(`DELETE FROM ${table} WHERE day < ?`).run(cutoff));
}

function getStats(currentConnections) {
    const today = rotate();
    const now = Date.now();
    const since = (days) => lib.kyivDateKey(new Date(now - (days - 1) * DAY_MS));
    const rows = (sql, ...params) => db.prepare(sql).all(...params);

    const todayRow = db.prepare('SELECT * FROM web_days WHERE day = ?').get(today);
    const daily = rows('SELECT day, visitors, sessions, peak_ws FROM web_days WHERE day >= ? ORDER BY day', since(HISTORY_DAYS)).map((row) => ({
        day: row.day,
        visitors: row.visitors,
        sessions: row.sessions,
        peakConnections: row.peak_ws,
    }));

    const grouped = (table, column, periodDays) => {
        const where = periodDays ? 'WHERE day >= ?' : '';
        const params = periodDays ? [since(periodDays)] : [];
        return rows(`SELECT ${column} AS key, SUM(visitors) AS c FROM ${table} ${where} GROUP BY ${column} ORDER BY c DESC LIMIT 15`, ...params).map((row) => ({
            key: row.key,
            visitors: row.c,
        }));
    };

    const oldestDay = db.prepare('SELECT MIN(day) AS d FROM web_days').get().d;
    const oldestMs = oldestDay ? new Date(`${oldestDay}T12:00:00Z`).getTime() : null;
    const retention = {
        days: RETENTION_DAYS,
        collectedDays: oldestMs ? Math.min(Math.floor((now - oldestMs) / DAY_MS) + 1, RETENTION_DAYS) : 0,
    };

    const totals = db.prepare('SELECT COALESCE(SUM(visitors), 0) AS visitors, COALESCE(SUM(sessions), 0) AS sessions FROM web_days').get();

    const hourlyRows = rows("SELECT hour, SUM(count) AS c FROM route_hits WHERE day = ? AND route LIKE '/public/%' GROUP BY hour", today);
    const hourly = Array.from({ length: 24 }, (_, hour) => {
        const row = hourlyRows.find((entry) => entry.hour === hour);
        return row ? row.c : 0;
    });

    return {
        generatedAt: new Date(now).toISOString(),
        today: {
            visitors: todayRow ? todayRow.visitors : 0,
            sessions: todayRow ? todayRow.sessions : 0,
            peakConnections: Math.max(todayRow ? todayRow.peak_ws : 0, currentConnections),
            connectionsNow: currentConnections,
        },
        retention,
        totals: { visitors: totals.visitors, sessions: totals.sessions },
        daily,
        countries: { today: grouped('web_country_days', 'country', 1), last7d: grouped('web_country_days', 'country', 7), allTime: grouped('web_country_days', 'country', 0) },
        languages: { today: grouped('web_lang_days', 'lang', 1), last7d: grouped('web_lang_days', 'lang', 7), allTime: grouped('web_lang_days', 'lang', 0) },
        hourlyRequestsToday: hourly,
    };
}

module.exports = { recordVisitor, recordSession, notePeak, prune, getStats };

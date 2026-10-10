// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { db } = require('./store');

const RETENTION_DAYS = 30;
const MAX_ROWS = 5000;
const MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NODE_NOISE = /ExperimentalWarning|--trace-warnings/;

db.exec(`CREATE TABLE IF NOT EXISTS log_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    t INTEGER NOT NULL,
    level TEXT NOT NULL,
    source TEXT NOT NULL,
    message TEXT NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_log_events_t ON log_events(t)');

const insertEvent = db.prepare('INSERT INTO log_events (t, level, source, message) VALUES (?, ?, ?, ?)');

let installed = false;

function formatArgument(value) {
    if (typeof value === 'string') return value;
    if (value && value.stack) return value.stack;
    try {
        return JSON.stringify(value);
    } catch (err) {
        return String(value);
    }
}

function splitSource(text) {
    const match = text.match(/^\[([^\]]+)\]\s*/);
    if (!match) return { source: 'server', message: text };
    return { source: match[1], message: text.slice(match[0].length) };
}

function record(level, args) {
    try {
        const text = args.map(formatArgument).join(' ').trim();
        if (!text || NODE_NOISE.test(text)) return;
        const { source, message } = splitSource(text);
        insertEvent.run(Date.now(), level, source.slice(0, 60), message.slice(0, MAX_MESSAGE_LENGTH));
    } catch (err) {}
}

function install() {
    if (installed) return;
    installed = true;
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);
    console.warn = (...args) => {
        record('warn', args);
        originalWarn(...args);
    };
    console.error = (...args) => {
        record('error', args);
        originalError(...args);
    };
}

function getEvents({ level, limit } = {}) {
    const size = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));
    const rows =
        level === 'error' || level === 'warn'
            ? db.prepare('SELECT id, t, level, source, message FROM log_events WHERE level = ? ORDER BY id DESC LIMIT ?').all(level, size)
            : db.prepare('SELECT id, t, level, source, message FROM log_events ORDER BY id DESC LIMIT ?').all(size);
    return rows.map((row) => ({ id: row.id, t: row.t, level: row.level, source: row.source, message: row.message }));
}

function getCounts() {
    const since = Date.now() - DAY_MS;
    const row = db
        .prepare(
            `SELECT
                COALESCE(SUM(CASE WHEN level = 'error' AND t >= ? THEN 1 ELSE 0 END), 0) AS errors24h,
                COALESCE(SUM(CASE WHEN level = 'warn' AND t >= ? THEN 1 ELSE 0 END), 0) AS warnings24h,
                COUNT(*) AS total,
                MIN(t) AS oldest
             FROM log_events`
        )
        .get(since, since);
    return { errors24h: row.errors24h, warnings24h: row.warnings24h, total: row.total, oldest: row.oldest, retentionDays: RETENTION_DAYS };
}

function prune() {
    db.prepare('DELETE FROM log_events WHERE t < ?').run(Date.now() - RETENTION_DAYS * DAY_MS);
    db.prepare('DELETE FROM log_events WHERE id <= (SELECT id FROM log_events ORDER BY id DESC LIMIT 1 OFFSET ?)').run(MAX_ROWS);
}

module.exports = { install, getEvents, getCounts, prune };

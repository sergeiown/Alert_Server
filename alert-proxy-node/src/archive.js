// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('node:fs');
const { db } = require('./store');
const { DB_PATH } = require('./config');

const THREAT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ALERTS_QUERY_LIMIT = 5000;
const TRACK_SAMPLE_MS = 3 * 60 * 1000;

db.exec(`CREATE TABLE IF NOT EXISTS alert_events (
    id TEXT PRIMARY KEY,
    location_uid TEXT,
    location_title TEXT,
    location_oblast TEXT,
    location_type TEXT,
    alert_type TEXT,
    started_at TEXT,
    finished_at TEXT,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
)`);
const existingColumns = db.prepare('PRAGMA table_info(alert_events)').all().map((column) => column.name);
if (!existingColumns.includes('updated_at')) db.exec('ALTER TABLE alert_events ADD COLUMN updated_at TEXT');
if (!existingColumns.includes('deleted_at')) db.exec('ALTER TABLE alert_events ADD COLUMN deleted_at TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_alert_events_started ON alert_events(started_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_alert_events_uid ON alert_events(location_uid)');
db.exec(`CREATE TABLE IF NOT EXISTS neptun_threats (
    id TEXT PRIMARY KEY,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    removed_at INTEGER,
    data TEXT NOT NULL
)`);

const threatColumns = db.prepare('PRAGMA table_info(neptun_threats)').all().map((column) => column.name);
if (!threatColumns.includes('first_region')) db.exec('ALTER TABLE neptun_threats ADD COLUMN first_region TEXT');
if (!threatColumns.includes('first_lat')) db.exec('ALTER TABLE neptun_threats ADD COLUMN first_lat REAL');
if (!threatColumns.includes('first_lon')) db.exec('ALTER TABLE neptun_threats ADD COLUMN first_lon REAL');
db.exec('CREATE INDEX IF NOT EXISTS idx_neptun_threats_first_seen ON neptun_threats(first_seen)');
db.exec(`CREATE TABLE IF NOT EXISTS neptun_track (
    threat_id TEXT NOT NULL,
    t INTEGER NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    heading REAL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_neptun_track_threat ON neptun_track(threat_id, t)');
db.exec('CREATE INDEX IF NOT EXISTS idx_neptun_track_t ON neptun_track(t)');

const upsertAlert = db.prepare(`INSERT INTO alert_events
    (id, location_uid, location_title, location_oblast, location_type, alert_type, started_at, finished_at, updated_at, deleted_at, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        location_title = excluded.location_title,
        location_oblast = excluded.location_oblast,
        alert_type = excluded.alert_type,
        finished_at = COALESCE(excluded.finished_at, alert_events.finished_at),
        updated_at = COALESCE(excluded.updated_at, alert_events.updated_at),
        deleted_at = COALESCE(excluded.deleted_at, alert_events.deleted_at),
        last_seen = MAX(excluded.last_seen, alert_events.last_seen)`);

function runUpsert(alert, firstSeen, lastSeen) {
    if (alert.id === undefined || alert.id === null) return null;
    const id = String(alert.id);
    upsertAlert.run(
        id,
        alert.location_uid === undefined || alert.location_uid === null ? null : String(alert.location_uid),
        alert.location_title || null,
        alert.location_oblast || null,
        alert.location_type || null,
        alert.alert_type || null,
        alert.started_at || null,
        alert.finished_at || null,
        alert.updated_at || null,
        alert.deleted_at || null,
        firstSeen,
        lastSeen
    );
    return id;
}
const finishAlert = db.prepare('UPDATE alert_events SET finished_at = ? WHERE id = ? AND finished_at IS NULL');
const upsertThreat = db.prepare(`INSERT INTO neptun_threats (id, first_seen, last_seen, removed_at, data, first_region, first_lat, first_lon)
    VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, removed_at = NULL, data = excluded.data`);
const insertTrackPoint = db.prepare('INSERT INTO neptun_track (threat_id, t, lat, lon, heading) VALUES (?, ?, ?, ?, ?)');
const lastTrackAt = new Map();
const removeThreat = db.prepare('UPDATE neptun_threats SET removed_at = ? WHERE id = ? AND removed_at IS NULL');

let activeIds = new Set(db.prepare('SELECT id FROM alert_events WHERE finished_at IS NULL').all().map((row) => row.id));

function inTransaction(fn) {
    db.exec('BEGIN');
    try {
        fn();
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

function recordActiveAlerts(alerts) {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const currentIds = new Set();

    inTransaction(() => {
        (alerts || []).forEach((alert) => {
            const id = runUpsert(alert, now, now);
            if (id !== null) currentIds.add(id);
        });

        activeIds.forEach((id) => {
            if (!currentIds.has(id)) finishAlert.run(nowIso, id);
        });
    });

    activeIds = new Set(
        [...currentIds].filter((id) => {
            const alert = (alerts || []).find((a) => String(a.id) === id);
            return alert && !alert.finished_at;
        })
    );
}

function upsertMany(alerts) {
    const now = Date.now();
    inTransaction(() => {
        (alerts || []).forEach((alert) => {
            const startedMs = new Date(alert.started_at).getTime();
            runUpsert(alert, Number.isFinite(startedMs) ? startedMs : now, now);
        });
    });
}

function rowToAlert(row) {
    return {
        id: row.id,
        location_uid: row.location_uid,
        location_title: row.location_title,
        location_oblast: row.location_oblast,
        location_type: row.location_type,
        alert_type: row.alert_type,
        started_at: row.started_at,
        finished_at: row.finished_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at,
    };
}

function getRegionAlerts(uid, stateName) {
    const rows = stateName
        ? db.prepare('SELECT * FROM alert_events WHERE location_oblast = ? OR location_uid = ?').all(stateName, String(uid))
        : db.prepare('SELECT * FROM alert_events WHERE location_uid = ?').all(String(uid));
    return rows.map(rowToAlert);
}

function getAlertsFromDay(dayKey) {
    return db.prepare('SELECT * FROM alert_events WHERE started_at >= ?').all(dayKey).map(rowToAlert);
}

function getCoverage() {
    const row = db.prepare('SELECT MIN(started_at) AS oldest, COUNT(*) AS total FROM alert_events').get();
    return { oldest: row.oldest, total: row.total };
}

function recordThreats(threats, removedIds) {
    const now = Date.now();
    inTransaction(() => {
        (threats || []).forEach((threat) => {
            if (!threat || !threat.id) return;
            const id = String(threat.id);
            const hasPosition = Number.isFinite(threat.lat) && Number.isFinite(threat.lon);
            upsertThreat.run(id, now, now, JSON.stringify(threat), threat.region || null, hasPosition ? threat.lat : null, hasPosition ? threat.lon : null);
            if (hasPosition && now - (lastTrackAt.get(id) || 0) >= TRACK_SAMPLE_MS) {
                lastTrackAt.set(id, now);
                insertTrackPoint.run(id, now, threat.lat, threat.lon, Number.isFinite(threat.heading) ? threat.heading : null);
            }
        });
        (removedIds || []).forEach((id) => {
            removeThreat.run(now, String(id));
            lastTrackAt.delete(String(id));
        });
    });
}

function pruneOldThreats() {
    const cutoff = Date.now() - THREAT_RETENTION_MS;
    db.prepare('DELETE FROM neptun_threats WHERE (removed_at IS NOT NULL AND removed_at < ?) OR last_seen < ?').run(cutoff, cutoff);
    db.prepare('DELETE FROM neptun_track WHERE t < ?').run(cutoff);
}

function getThreatsSince(sinceMs) {
    return db
        .prepare(
            `SELECT id, first_seen, last_seen, removed_at, first_region, first_lat, first_lon,
                json_extract(data, '$.type') AS type, json_extract(data, '$.title') AS title,
                json_extract(data, '$.region') AS last_region, json_extract(data, '$.lat') AS last_lat, json_extract(data, '$.lon') AS last_lon
             FROM neptun_threats WHERE first_seen >= ? ORDER BY first_seen`
        )
        .all(sinceMs);
}

function getAlertStartsSince(sinceIso) {
    return db
        .prepare('SELECT location_oblast, started_at FROM alert_events WHERE started_at >= ? AND deleted_at IS NULL AND location_oblast IS NOT NULL')
        .all(sinceIso);
}

function getTrackStats() {
    return db.prepare('SELECT COUNT(*) AS points, MIN(t) AS oldest FROM neptun_track').get();
}

function getAlertsSince(sinceIso, uid) {
    const clauses = [];
    const params = [];
    if (sinceIso) {
        clauses.push('started_at >= ?');
        params.push(sinceIso);
    }
    if (uid) {
        clauses.push('location_uid = ?');
        params.push(String(uid));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return db
        .prepare(`SELECT * FROM alert_events ${where} ORDER BY started_at DESC LIMIT ${ALERTS_QUERY_LIMIT}`)
        .all(...params);
}

function getStats() {
    const alertRow = db
        .prepare('SELECT COUNT(*) AS total, MIN(started_at) AS oldest, MAX(started_at) AS newest FROM alert_events')
        .get();
    const threatRow = db
        .prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN removed_at IS NULL THEN 1 ELSE 0 END) AS open FROM neptun_threats')
        .get();
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const last30d = db.prepare('SELECT COUNT(*) AS c FROM alert_events WHERE started_at >= ?').get(since30d).c;
    let dbSizeBytes = null;
    try {
        dbSizeBytes = fs.statSync(DB_PATH).size;
    } catch (err) {}

    return {
        alertEvents: { last30d, total: alertRow.total, oldestStartedAt: alertRow.oldest, newestStartedAt: alertRow.newest, openNow: activeIds.size },
        neptunThreats: { total: threatRow.total, open: threatRow.open || 0 },
        dbSizeBytes,
    };
}

module.exports = { recordActiveAlerts, upsertMany, getRegionAlerts, getAlertsFromDay, getCoverage, recordThreats, pruneOldThreats, getAlertsSince, getStats, getThreatsSince, getAlertStartsSince, getTrackStats };

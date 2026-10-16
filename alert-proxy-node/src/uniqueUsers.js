// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const store = require('./store');
const lib = require('./lib');

const { db } = store;

db.exec('CREATE TABLE IF NOT EXISTS unique_all (id TEXT PRIMARY KEY) WITHOUT ROWID');
db.exec('CREATE TABLE IF NOT EXISTS unique_day (day TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (day, id)) WITHOUT ROWID');

const insertAll = db.prepare('INSERT OR IGNORE INTO unique_all (id) VALUES (?)');
const insertDay = db.prepare('INSERT OR IGNORE INTO unique_day (day, id) VALUES (?, ?)');

function inTransaction(work) {
    db.exec('BEGIN');
    try {
        work();
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

function migrateLegacyState() {
    if (store.get('uniqueUsersMigrated')) return;
    const legacyAll = store.get('allTimeUniqueUsersState');
    const legacyDaily = store.get('uniqueUsersState');
    inTransaction(() => {
        if (legacyAll && Array.isArray(legacyAll.hashedIps)) legacyAll.hashedIps.forEach((id) => insertAll.run(id));
        if (legacyDaily && legacyDaily.date && Array.isArray(legacyDaily.hashedIps)) {
            legacyDaily.hashedIps.forEach((id) => {
                insertDay.run(legacyDaily.date, id);
                insertAll.run(id);
            });
        }
    });
    store.put('uniqueUsersMigrated', { at: Date.now(), all: legacyAll ? legacyAll.hashedIps.length : 0, daily: legacyDaily ? legacyDaily.hashedIps.length : 0 });
}

migrateLegacyState();

const allSet = new Set(db.prepare('SELECT id FROM unique_all').all().map((row) => row.id));
let todayDate = null;
let todaySet = new Set();
let onFinishedDay = null;

function loadDay(day) {
    todayDate = day;
    todaySet = new Set(db.prepare('SELECT id FROM unique_day WHERE day = ?').all(day).map((row) => row.id));
}

function rollover(day) {
    if (todayDate && onFinishedDay) onFinishedDay({ date: todayDate, count: todaySet.size });
    db.prepare('DELETE FROM unique_day WHERE day < ?').run(day);
    loadDay(day);
}

function ensureToday() {
    const day = lib.kyivDateKey(new Date());
    if (day === todayDate) return;
    if (!todayDate) {
        const latest = db.prepare('SELECT MAX(day) AS day FROM unique_day').get().day;
        if (latest && latest < day) {
            loadDay(latest);
            rollover(day);
            return;
        }
        loadDay(day);
        return;
    }
    rollover(day);
}

function record(hashed) {
    ensureToday();
    const freshToday = !todaySet.has(hashed);
    const freshAll = !allSet.has(hashed);
    if (!freshToday && !freshAll) return;
    inTransaction(() => {
        if (freshToday) insertDay.run(todayDate, hashed);
        if (freshAll) insertAll.run(hashed);
    });
    todaySet.add(hashed);
    allSet.add(hashed);
}

function counts() {
    ensureToday();
    return { date: todayDate, allTime: allSet.size, today: todaySet.size };
}

function onDayFinished(handler) {
    onFinishedDay = handler;
}

module.exports = { record, counts, onDayFinished };

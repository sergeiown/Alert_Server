// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

// One-off import of the public Vadimkin/ukrainian-air-raid-sirens-dataset (MIT) into the alert archive,
// so the all-time counters and the forecast see the history from 2022 and not only what the server
// recorded itself. Rows are oblast-level, marked source = 'sirens-dataset', and never overlap the
// period the server already has (they stop where the archive begins). Safe to run again.
//
// Usage: DATA_DIR=/path/to/data node scripts/import-sirens-dataset.js volunteer_data_uk.csv

const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../src/store');
const states = require('../resources/states.json');

const SOURCE = 'sirens-dataset';
const csvPath = process.argv[2];
if (!csvPath) {
    console.error('Pass the path to volunteer_data_uk.csv');
    process.exit(1);
}

const columns = db.prepare('PRAGMA table_info(alert_events)').all().map((column) => column.name);
if (!columns.includes('source')) db.exec('ALTER TABLE alert_events ADD COLUMN source TEXT');

const uidByName = new Map(Object.entries(states).map(([uid, name]) => [name, uid]));
uidByName.set('Київ', '31');

const toIso = (value) => new Date(value.replace(' ', 'T').replace('+00:00', 'Z')).toISOString();

const archiveStart = db
    .prepare("SELECT MIN(started_at) AS m FROM alert_events WHERE source IS NOT 'sirens-dataset' AND started_at >= '2026-01-01'")
    .get().m;
console.log(`Archive of live data starts at ${archiveStart}`);

const insert = db.prepare(`INSERT OR IGNORE INTO alert_events
    (id, location_uid, location_title, location_oblast, location_type, alert_type, started_at, finished_at, updated_at, deleted_at, first_seen, last_seen, source)
    VALUES (?, ?, ?, ?, ?, 'air_raid', ?, ?, NULL, NULL, ?, ?, ?)`);

const lines = fs.readFileSync(path.resolve(csvPath), 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
let imported = 0;
let skippedUnknown = 0;
let skippedOverlap = 0;

db.exec('BEGIN');
try {
    lines.forEach((line) => {
        const [region, started, finished] = line.split(',');
        const uid = uidByName.get(region);
        if (!uid) {
            skippedUnknown++;
            return;
        }

        const startedIso = toIso(started);
        const finishedIso = finished ? toIso(finished) : null;
        if (archiveStart && startedIso >= archiveStart) {
            skippedOverlap++;
            return;
        }

        const title = uid === '31' ? 'м. Київ' : region;
        const startedMs = new Date(startedIso).getTime();
        const finishedMs = finishedIso ? new Date(finishedIso).getTime() : startedMs;
        const result = insert.run(`dataset-${uid}-${startedMs}`, uid, title, title, 'oblast', startedIso, finishedIso, startedMs, finishedMs, SOURCE);
        imported += Number(result.changes);
    });
    db.exec('COMMIT');
} catch (err) {
    db.exec('ROLLBACK');
    throw err;
}

console.log(`Imported ${imported} rows (unknown region: ${skippedUnknown}, overlapping the live archive: ${skippedOverlap})`);

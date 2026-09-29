// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR, DB_PATH } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');

const getStmt = db.prepare('SELECT value FROM kv_store WHERE key = ?');
const putStmt = db.prepare(
    'INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
);

function get(key) {
    const row = getStmt.get(key);
    if (!row) return undefined;
    return JSON.parse(row.value);
}

function put(key, value) {
    putStmt.run(key, JSON.stringify(value), Date.now());
}

module.exports = { get, put };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('node:fs');
const path = require('node:path');
const store = require('./store');
const { DATA_DIR } = require('./config');

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const KEEP_COUNT = 7;

function pad(n) {
    return String(n).padStart(2, '0');
}

function stamp(date) {
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}

function listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs
        .readdirSync(BACKUP_DIR)
        .filter((name) => /^alert-proxy-\d{8}-\d{4}\.sqlite$/.test(name))
        .sort();
}

function runBackupIfDue() {
    const last = store.get('lastBackup');
    if (last && Date.now() - last.at < BACKUP_INTERVAL_MS) return;

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const now = new Date();
    const file = `alert-proxy-${stamp(now)}.sqlite`;
    const target = path.join(BACKUP_DIR, file);
    if (fs.existsSync(target)) fs.unlinkSync(target);

    store.vacuumInto(target);
    const sizeBytes = fs.statSync(target).size;
    store.put('lastBackup', { at: now.getTime(), file, sizeBytes });

    const all = listBackups();
    all.slice(0, Math.max(0, all.length - KEEP_COUNT)).forEach((name) => fs.unlinkSync(path.join(BACKUP_DIR, name)));
    console.log(`[backup] wrote ${file} (${sizeBytes} bytes)`);
}

function getStatusInfo() {
    const last = store.get('lastBackup');
    return {
        lastBackupAt: last ? new Date(last.at).toISOString() : null,
        ageMs: last ? Date.now() - last.at : null,
        file: last ? last.file : null,
        sizeBytes: last ? last.sizeBytes : null,
        keptCount: listBackups().length,
        keepLimit: KEEP_COUNT,
    };
}

module.exports = { runBackupIfDue, getStatusInfo };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const nodeCrypto = require('node:crypto');

const KINDS = ['idea', 'problem', 'other'];
const LIMITS = {
    textMin: 10,
    textMax: 2000,
    nameMax: 50,
    contactMax: 100,
    maxLinks: 3,
    perClientGapMs: 10 * 60 * 1000,
    perClientPerDay: 5,
    perIpPerDay: 10,
    totalMax: 5000,
};
const DAY_MS = 24 * 60 * 60 * 1000;
const LINK_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

function cleanLine(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(CONTROL_PATTERN, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanText(value) {
    if (typeof value !== 'string') return '';
    return value
        .replace(/\r\n?/g, '\n')
        .replace(CONTROL_PATTERN, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalize(input) {
    const source = input && typeof input === 'object' ? input : {};
    const kind = KINDS.includes(source.kind) ? source.kind : 'other';
    const text = cleanText(source.text);
    if (text.length < LIMITS.textMin) return { error: 'too-short' };
    if (text.length > LIMITS.textMax) return { error: 'too-long' };
    const links = text.match(LINK_PATTERN) || [];
    if (links.length > LIMITS.maxLinks) return { error: 'too-many-links' };
    return {
        value: {
            kind,
            text,
            name: cleanLine(source.name, LIMITS.nameMax),
            contact: cleanLine(source.contact, LIMITS.contactMax),
        },
    };
}

function textHash(text) {
    return nodeCrypto.createHash('sha256').update(text.toLowerCase().replace(/\s+/g, ' ')).digest('hex').slice(0, 32);
}

function createFeedbackStore(db, now = Date.now) {
    db.exec(`CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        client_id TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        country TEXT,
        version TEXT,
        language TEXT,
        kind TEXT NOT NULL,
        name TEXT,
        contact TEXT,
        text TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS feedback_client ON feedback (client_id, created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS feedback_ip ON feedback (ip_hash, created_at)');

    const insertStmt = db.prepare(
        'INSERT INTO feedback (created_at, client_id, ip_hash, country, version, language, kind, name, contact, text, text_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const lastByClientStmt = db.prepare('SELECT created_at FROM feedback WHERE client_id = ? ORDER BY created_at DESC LIMIT 1');
    const countClientDayStmt = db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE client_id = ? AND created_at > ?');
    const countIpDayStmt = db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > ?');
    const duplicateStmt = db.prepare('SELECT 1 FROM feedback WHERE client_id = ? AND text_hash = ? AND created_at > ? LIMIT 1');
    const totalStmt = db.prepare('SELECT COUNT(*) AS n FROM feedback');
    const listStmt = db.prepare('SELECT * FROM feedback ORDER BY created_at DESC, id DESC LIMIT ?');
    const unreadStmt = db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE is_read = 0');
    const markStmt = db.prepare('UPDATE feedback SET is_read = ? WHERE id = ?');
    const markAllStmt = db.prepare('UPDATE feedback SET is_read = 1 WHERE is_read = 0');
    const deleteStmt = db.prepare('DELETE FROM feedback WHERE id = ?');

    function submit({ clientId, ipHash, country, version, language, payload }) {
        const normalized = normalize(payload);
        if (normalized.error) return { status: 400, error: normalized.error };

        const time = now();
        const last = lastByClientStmt.get(clientId);
        if (last && time - last.created_at < LIMITS.perClientGapMs) {
            return { status: 429, error: 'rate', retryAfterSec: Math.ceil((LIMITS.perClientGapMs - (time - last.created_at)) / 1000) };
        }
        if (countClientDayStmt.get(clientId, time - DAY_MS).n >= LIMITS.perClientPerDay) return { status: 429, error: 'rate', retryAfterSec: 3600 };
        if (countIpDayStmt.get(ipHash, time - DAY_MS).n >= LIMITS.perIpPerDay) return { status: 429, error: 'rate', retryAfterSec: 3600 };
        if (totalStmt.get().n >= LIMITS.totalMax) return { status: 503, error: 'full' };

        const { kind, text, name, contact } = normalized.value;
        const hash = textHash(text);
        if (duplicateStmt.get(clientId, hash, time - DAY_MS)) return { status: 200, ok: true, duplicate: true };

        insertStmt.run(
            time,
            clientId,
            ipHash,
            country || null,
            cleanLine(version, 32) || null,
            cleanLine(language, 16) || null,
            kind,
            name || null,
            contact || null,
            text,
            hash
        );
        return { status: 200, ok: true };
    }

    function list(limit = 500) {
        const rows = listStmt.all(Math.max(1, Math.min(2000, Number(limit) || 500)));
        return {
            unread: unreadStmt.get().n,
            total: totalStmt.get().n,
            items: rows.map((row) => ({
                id: row.id,
                createdAt: new Date(row.created_at).toISOString(),
                clientId: row.client_id,
                country: row.country,
                version: row.version,
                language: row.language,
                kind: row.kind,
                name: row.name,
                contact: row.contact,
                text: row.text,
                read: Boolean(row.is_read),
            })),
        };
    }

    function update({ action, id }) {
        if (action === 'read-all') {
            markAllStmt.run();
            return true;
        }
        const numericId = Number(id);
        if (!Number.isInteger(numericId)) return false;
        if (action === 'read') markStmt.run(1, numericId);
        else if (action === 'unread') markStmt.run(0, numericId);
        else if (action === 'delete') deleteStmt.run(numericId);
        else return false;
        return true;
    }

    return { submit, list, update };
}

module.exports = { createFeedbackStore, normalize, LIMITS, KINDS };

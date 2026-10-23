// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const crypto = require('crypto');
const fs = require('fs');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FILE_NAME = 'install_id.txt';

let cached = null;

function isValidInstallId(value) {
    return typeof value === 'string' && UUID_V4.test(value);
}

function resolveFilePath() {
    try {
        return require('./appPaths').getUserDataFile(FILE_NAME);
    } catch (err) {
        return null;
    }
}

function readStored(filePath) {
    try {
        const stored = fs.readFileSync(filePath, 'utf-8').trim().toLowerCase();
        return isValidInstallId(stored) ? stored : null;
    } catch (err) {
        return null;
    }
}

function getInstallId(filePath = resolveFilePath()) {
    if (cached) return cached;

    const stored = filePath ? readStored(filePath) : null;
    if (stored) {
        cached = stored;
        return cached;
    }

    cached = crypto.randomUUID();
    if (filePath) {
        try {
            fs.writeFileSync(filePath, cached, 'utf-8');
        } catch (err) {}
    }
    return cached;
}

function resetInstallIdCache() {
    cached = null;
}

module.exports = { getInstallId, isValidInstallId, resetInstallIdCache };

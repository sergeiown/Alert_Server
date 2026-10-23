// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getInstallId, isValidInstallId, resetInstallIdCache } = require('../src/main/services/installId');

function check(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

function tempFile() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'install-id-')), 'install_id.txt');
}

check('the first launch creates a valid id and stores it', () => {
    resetInstallIdCache();
    const file = tempFile();
    const id = getInstallId(file);
    assert.ok(isValidInstallId(id));
    assert.strictEqual(fs.readFileSync(file, 'utf-8'), id);
});

check('a later launch returns the same id from the file', () => {
    resetInstallIdCache();
    const file = tempFile();
    const first = getInstallId(file);
    resetInstallIdCache();
    assert.strictEqual(getInstallId(file), first);
});

check('a corrupted file is replaced by a fresh valid id', () => {
    resetInstallIdCache();
    const file = tempFile();
    fs.writeFileSync(file, 'garbage', 'utf-8');
    const id = getInstallId(file);
    assert.ok(isValidInstallId(id));
    assert.strictEqual(fs.readFileSync(file, 'utf-8'), id);
});

check('the id stays stable inside one run even when the file cannot be written', () => {
    resetInstallIdCache();
    const missingDir = path.join(os.tmpdir(), 'install-id-missing', 'sub', 'install_id.txt');
    const first = getInstallId(missingDir);
    assert.ok(isValidInstallId(first));
    assert.strictEqual(getInstallId(missingDir), first);
});

check('two installations get different ids', () => {
    resetInstallIdCache();
    const first = getInstallId(tempFile());
    resetInstallIdCache();
    const second = getInstallId(tempFile());
    assert.notStrictEqual(first, second);
});

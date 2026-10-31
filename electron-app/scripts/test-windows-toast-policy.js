// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('assert');
const { windowsBuild, urgentSupported, parseUrgentValue, readUrgentPermission } = require('../src/main/services/windowsToastPolicy');

let passed = 0;
const check = async (name, fn) => {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
};

(async () => {
    await check('the Windows build number is read from the OS release string', () => {
        assert.strictEqual(windowsBuild('10.0.22631', 'win32'), 22631);
        assert.strictEqual(windowsBuild('10.0.19045', 'win32'), 19045);
        assert.strictEqual(windowsBuild('6.1.7601', 'win32'), 7601);
        assert.strictEqual(windowsBuild('garbage', 'win32'), 0);
        assert.strictEqual(windowsBuild('10.0.22631', 'linux'), 0);
    });

    await check('urgent toasts count as supported from build 19044 and not before', () => {
        assert.strictEqual(urgentSupported('10.0.19043', 'win32'), false);
        assert.strictEqual(urgentSupported('10.0.19044', 'win32'), true);
        assert.strictEqual(urgentSupported('10.0.26100', 'win32'), true);
        assert.strictEqual(urgentSupported('10.0.26100', 'darwin'), false);
    });

    await check('the registry output is parsed into allowed, denied or unknown', () => {
        assert.strictEqual(parseUrgentValue('    AllowUrgentNotifications    REG_DWORD    0x1\r\n'), true);
        assert.strictEqual(parseUrgentValue('    AllowUrgentNotifications    REG_DWORD    0x0\r\n'), false);
        assert.strictEqual(parseUrgentValue('nothing useful'), null);
    });

    await check('the live permission lookup always answers with one of the three states', async () => {
        const status = await readUrgentPermission();
        assert.ok(['allowed', 'notAllowed', 'unsupported'].includes(status), status);
    });

    console.log(`\n${passed} checks passed`);
    process.exit(0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});

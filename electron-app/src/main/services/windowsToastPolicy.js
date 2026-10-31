// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const os = require('os');
const { execFile } = require('child_process');

const AUMID = 'com.sergeiown.alertserver';
const SETTINGS_KEY = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\${AUMID}`;
const URGENT_MIN_BUILD = 19044;

function windowsBuild(release = os.release(), platform = process.platform) {
    if (platform !== 'win32') return 0;
    const parts = String(release).split('.');
    const build = Number(parts[2]);
    return Number.isFinite(build) ? build : 0;
}

function urgentSupported(release, platform) {
    return windowsBuild(release, platform) >= URGENT_MIN_BUILD;
}

function parseUrgentValue(output) {
    const match = /AllowUrgentNotifications\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(String(output));
    if (!match) return null;
    return parseInt(match[1], 16) === 1;
}

function readUrgentPermission() {
    if (!urgentSupported()) return Promise.resolve('unsupported');
    return new Promise((resolve) => {
        execFile('reg', ['query', SETTINGS_KEY, '/v', 'AllowUrgentNotifications'], { windowsHide: true }, (err, stdout) => {
            if (err) {
                resolve('notAllowed');
                return;
            }
            resolve(parseUrgentValue(stdout) ? 'allowed' : 'notAllowed');
        });
    });
}

module.exports = { windowsBuild, urgentSupported, parseUrgentValue, readUrgentPermission, URGENT_MIN_BUILD };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { systemPreferences } = require('electron');
const { execFileSync } = require('child_process');

function isColorPrevalenceEnabled() {
    if (process.platform !== 'win32') return false;

    try {
        const output = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\DWM', '/v', 'ColorPrevalence'], {
            encoding: 'utf-8',
            windowsHide: true,
        });
        const match = output.match(/ColorPrevalence\s+REG_DWORD\s+0x([0-9a-f]+)/i);
        return match ? parseInt(match[1], 16) === 1 : false;
    } catch {
        return false;
    }
}

function getAccentColorHex() {
    if (typeof systemPreferences.getAccentColor !== 'function') return null;

    try {
        const raw = systemPreferences.getAccentColor();
        return raw && raw.length >= 6 ? `#${raw.slice(0, 6)}` : null;
    } catch {
        return null;
    }
}

function getTitleBarAccentColor() {
    return isColorPrevalenceEnabled() ? getAccentColorHex() : null;
}

module.exports = { getTitleBarAccentColor };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

// Nothing in this app sets titleBarStyle/backgroundColor on any BrowserWindow, so every window's
// title bar is whatever Windows itself renders by default - plain neutral gray/near-black UNLESS
// the user has "Show accent color on title bars and window borders" turned on (Settings >
// Personalization > Colors), in which case Windows paints the title bar with the system's own
// accent color instead. The live map's own chrome (buttons/legend/status bar/attribution) is tinted
// to match whichever of those is actually true, rather than always assuming the plain default.

const { systemPreferences } = require('electron');
const { execFileSync } = require('child_process');

// No documented Electron/Node API exposes this toggle directly - read via the same registry value
// Windows/DWM itself uses (HKCU\...\DWM\ColorPrevalence, DWORD 1 when enabled). `reg.exe` ships
// with Windows itself, so this needs no extra dependency; any failure (key missing, reg.exe
// unavailable, non-Windows) is treated as "off", matching the more common default.
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

// getAccentColor() returns 8 hex chars in RRGGBBAA form (Electron's own docs) - only the RGB part
// is relevant here, alpha is always opaque for a system accent color.
function getAccentColorHex() {
    if (typeof systemPreferences.getAccentColor !== 'function') return null;

    try {
        const raw = systemPreferences.getAccentColor();
        return raw && raw.length >= 6 ? `#${raw.slice(0, 6)}` : null;
    } catch {
        return null;
    }
}

// null means "no real accent tint to apply" - the caller falls back to its own static default
// shade for the current theme, same as before this existed.
function getTitleBarAccentColor() {
    return isColorPrevalenceEnabled() ? getAccentColorHex() : null;
}

module.exports = { getTitleBarAccentColor };

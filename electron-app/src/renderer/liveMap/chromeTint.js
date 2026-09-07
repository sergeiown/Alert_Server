// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

// Tints the map's own chrome (buttons, legend, status bar, attribution - see index.css's
// "--map-chrome-*" custom properties) to match this window's REAL title bar color, when there is
// one to match: a null/falsy accent color (the common case - Windows' "Show accent color on title
// bars" setting is off) means there's nothing to override, and index.css's own static per-theme
// default (set directly on those properties, no JS involved) is exactly what the title bar actually
// looks like already.

function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]) {
    return (
        '#' +
        [r, g, b]
            .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
            .join('')
    );
}

// Blends `hex` toward `target` ([r,g,b]) by `amount` (0 = unchanged, 1 = exactly `target`) - used
// to derive a border (blended toward black) and a hover shade (blended toward white) from one
// accent color, since an arbitrary user-chosen accent has no built-in "slightly darker/lighter"
// variant the way the two hand-picked static defaults did.
function mix(hex, target, amount) {
    const [r, g, b] = hexToRgb(hex);
    const [tr, tg, tb] = target;
    return rgbToHex([r + (tr - r) * amount, g + (tg - g) * amount, b + (tb - b) * amount]);
}

// Standard relative-luminance formula (WCAG) - picks readable light or dark text/icon color for
// whatever the accent turns out to be, the same way Windows itself switches the title bar's own
// caption text between white and black depending on how bright the accent color is.
function relativeLuminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
    const linear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function applyTitleBarAccentColor(accentHex) {
    const root = document.documentElement.style;

    if (!accentHex) {
        // Nothing to override - clear back to index.css's own static per-theme default (relevant
        // when this is called again after a live accent-color change removed the accent tint).
        ['--map-chrome-bg', '--map-chrome-border', '--map-chrome-hover', '--map-chrome-text'].forEach((prop) =>
            root.removeProperty(prop)
        );
        return;
    }

    const border = mix(accentHex, [0, 0, 0], 0.25);
    const hover = mix(accentHex, [255, 255, 255], 0.15);
    const text = relativeLuminance(accentHex) > 0.45 ? '#1f1f1f' : '#f2f2f2';

    root.setProperty('--map-chrome-bg', accentHex);
    root.setProperty('--map-chrome-border', border);
    root.setProperty('--map-chrome-hover', hover);
    root.setProperty('--map-chrome-text', text);
}

export { applyTitleBarAccentColor };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

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

function mix(hex, target, amount) {
    const [r, g, b] = hexToRgb(hex);
    const [tr, tg, tb] = target;
    return rgbToHex([r + (tr - r) * amount, g + (tg - g) * amount, b + (tb - b) * amount]);
}

function relativeLuminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
    const linear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function applyTitleBarAccentColor(accentHex) {
    const root = document.documentElement.style;

    if (!accentHex) {

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

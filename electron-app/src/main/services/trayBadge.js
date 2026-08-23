// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { nativeImage } = require('electron');

// nativeImage's raw bitmap buffer is BGRA on Windows (the platform this app ships for).
const TINT_BGRA = [35, 55, 219];

// Colorizes rather than flatly overwriting: scaling the tint by each pixel's own luminance keeps
// the icon's own contrast intact (the exclamation mark, the pulse highlight) instead of flattening
// everything into one solid color, where the mark and the glow used to disappear into the badge.
function applyMassAttackBadge(image) {
    const { width, height } = image.getSize();
    const buffer = Buffer.from(image.toBitmap());

    for (let i = 0; i < buffer.length; i += 4) {
        if (buffer[i + 3] === 0) continue;
        const luminance = (0.114 * buffer[i] + 0.587 * buffer[i + 1] + 0.299 * buffer[i + 2]) / 255;
        buffer[i] = Math.round(TINT_BGRA[0] * luminance);
        buffer[i + 1] = Math.round(TINT_BGRA[1] * luminance);
        buffer[i + 2] = Math.round(TINT_BGRA[2] * luminance);
    }

    return nativeImage.createFromBitmap(buffer, { width, height });
}

module.exports = { applyMassAttackBadge };

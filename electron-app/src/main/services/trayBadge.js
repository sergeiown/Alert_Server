// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { nativeImage } = require('electron');

// nativeImage's raw bitmap buffer is BGRA on Windows (the platform this app ships for).
const TINT_BGRA = [35, 55, 219];

function applyMassAttackBadge(image) {
    const { width, height } = image.getSize();
    const buffer = Buffer.from(image.toBitmap());

    for (let i = 0; i < buffer.length; i += 4) {
        if (buffer[i + 3] === 0) continue;
        buffer[i] = TINT_BGRA[0];
        buffer[i + 1] = TINT_BGRA[1];
        buffer[i + 2] = TINT_BGRA[2];
    }

    return nativeImage.createFromBitmap(buffer, { width, height });
}

module.exports = { applyMassAttackBadge };

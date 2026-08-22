const { nativeImage } = require('electron');

// A small filled circle (with a white outline for contrast against any background color the
// underlying tray icon happens to have) drawn directly into the icon's raw pixel buffer - avoids
// needing a whole second set of pre-rendered icon assets just for this one extra state.
// nativeImage's raw bitmap buffer is BGRA on Windows (the platform this app ships for).
const FILL_BGRA = [35, 55, 219, 255];
const OUTLINE_BGRA = [255, 255, 255, 255];
const RADIUS_RATIO = 0.24;
const OUTLINE_THICKNESS = 1.4;

function applyMassAttackBadge(image) {
    const { width, height } = image.getSize();
    const buffer = Buffer.from(image.toBitmap());
    const radius = Math.max(3, Math.round(width * RADIUS_RATIO));
    const outerRadius = radius + OUTLINE_THICKNESS;
    const cx = width - radius - 1;
    const cy = height - radius - 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const distSq = dx * dx + dy * dy;
            if (distSq > outerRadius * outerRadius) continue;

            const color = distSq <= radius * radius ? FILL_BGRA : OUTLINE_BGRA;
            const idx = (y * width + x) * 4;
            buffer[idx] = color[0];
            buffer[idx + 1] = color[1];
            buffer[idx + 2] = color[2];
            buffer[idx + 3] = color[3];
        }
    }

    return nativeImage.createFromBitmap(buffer, { width, height });
}

module.exports = { applyMassAttackBadge };

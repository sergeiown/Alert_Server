// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const PULSE_ITERATIONS = 2;
const PULSE_STEP_MS = 420;
const PULSE_TOTAL_MS = PULSE_ITERATIONS * 2 * PULSE_STEP_MS + PULSE_STEP_MS;

function pulseLayerStyle(layer, timers, style) {
    if (timers.list) timers.list.forEach(clearTimeout);
    timers.list = [];

    const peakFillOpacity = Math.min(0.95, style.fillOpacity * 1.9 + 0.12);
    const peakOpacity = Math.min(1, style.opacity + 0.35);
    const troughFillOpacity = style.fillOpacity * 0.2;
    const troughOpacity = style.opacity * 0.25;

    const frames = [];
    for (let i = 0; i < PULSE_ITERATIONS; i++) {
        frames.push({ ...style, fillOpacity: peakFillOpacity, opacity: peakOpacity });
        frames.push({ ...style, fillOpacity: troughFillOpacity, opacity: troughOpacity });
    }
    frames.push(style);

    frames.forEach((frame, i) => {
        timers.list.push(setTimeout(() => layer.setStyle(frame), i * PULSE_STEP_MS));
    });
}

export { pulseLayerStyle, PULSE_TOTAL_MS };

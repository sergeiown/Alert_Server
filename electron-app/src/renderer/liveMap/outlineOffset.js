// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const COS_LAT = Math.cos((48.5 * Math.PI) / 180);
const METERS_PER_DEGREE = 111320;
const MAX_MITER = 2.5;

function unitNormal(from, to, side) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-12) return [0, 0];
    return [(side * -dy) / length, (side * dx) / length];
}

function offsetRing(ring, meters) {
    const count = ring.length;
    const points = ring.map(([lat, lng]) => [lng * COS_LAT, lat]);

    let area = 0;
    for (let i = 0; i < count; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % count];
        area += x1 * y2 - x2 * y1;
    }
    const side = area > 0 ? -1 : 1;
    const distance = meters / METERS_PER_DEGREE;

    return points.map((point, i) => {
        const previous = points[(i + count - 1) % count];
        const next = points[(i + 1) % count];
        const first = unitNormal(previous, point, side);
        const second = unitNormal(point, next, side);
        const sumX = first[0] + second[0];
        const sumY = first[1] + second[1];
        const length = Math.hypot(sumX, sumY);
        if (length < 1e-9) return ring[i];
        const mx = sumX / length;
        const my = sumY / length;
        const scale = Math.min(MAX_MITER, 1 / Math.max(0.0001, mx * first[0] + my * first[1]));
        return [point[1] + my * distance * scale, (point[0] + mx * distance * scale) / COS_LAT];
    });
}

function metersPerPixel(zoom) {
    return (156543.03392 * COS_LAT) / 2 ** zoom;
}

export { offsetRing, metersPerPixel };

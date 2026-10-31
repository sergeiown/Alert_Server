// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const ROWS = ['startRed', 'startYellow', 'escalateRed', 'digest', 'end', 'levelChange', 'forecast'];
const SECONDS_OPTIONS = [7, 10, 15, 20, 25, 30, 60, 120, 300, 900];

const DEFAULTS = {
    startRed: { emergency: true, seconds: 25 },
    startYellow: { emergency: false, seconds: 20 },
    escalateRed: { emergency: true, seconds: 25 },
    digest: { emergency: true, seconds: 25 },
    end: { emergency: false, seconds: 15 },
    levelChange: { emergency: false, seconds: 15 },
    forecast: { emergency: false, seconds: 15 },
};

function snapSeconds(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return SECONDS_OPTIONS.reduce((best, option) => (Math.abs(option - number) < Math.abs(best - number) ? option : best), SECONDS_OPTIONS[0]);
}

function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const result = {};
    ROWS.forEach((key) => {
        const entry = source[key] && typeof source[key] === 'object' ? source[key] : {};
        const fallback = DEFAULTS[key];
        result[key] = {
            emergency: typeof entry.emergency === 'boolean' ? entry.emergency : fallback.emergency,
            seconds: snapSeconds(entry.seconds, fallback.seconds),
        };
    });
    return result;
}

function resolve(raw, key) {
    const entry = normalize(raw)[key] || DEFAULTS.levelChange;
    return { emergency: entry.emergency, ms: entry.seconds * 1000 };
}

module.exports = { ROWS, SECONDS_OPTIONS, DEFAULTS, normalize, resolve };

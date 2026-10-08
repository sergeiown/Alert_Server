// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const GLYPH = '#f3f8ff';
const ACCENT = '#bcdcff';

const stroke = (extra = '') =>
    `fill="none" stroke="${GLYPH}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" ${extra}`;
const accent = (extra = '') =>
    `fill="none" stroke="${ACCENT}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" ${extra}`;

const TILES = {
    status: {
        from: '#6a92c4',
        to: '#3a5f95',
        glyph: `
            <path ${stroke()} d="M48 11 L77 23 V46 C77 63 65 76 48 83 C31 76 19 63 19 46 V23 Z"/>
            <path ${accent()} d="M29 49 H40 L45 36 L53 62 L58 49 H67"/>`,
    },
    liveMap: {
        from: '#46a3d8',
        to: '#2a6aa5',
        glyph: `
            <path ${stroke()} d="M48 13 C36 13 28 21.500 28 32 C28 46 48 64 48 64 C48 64 68 46 68 32 C68 21.500 60 13 48 13 Z"/>
            <circle cx="48" cy="32" r="8" fill="${GLYPH}"/>
            <path ${accent()} d="M22 74 C34 84 62 84 74 74"/>`,
    },
    forecast: {
        from: '#7683d2',
        to: '#46529f',
        glyph: `
            <circle cx="46" cy="50" r="26" ${stroke()}/>
            <path ${stroke()} d="M46 34 V50 L57 57"/>
            <path ${accent('stroke-dasharray="3 8"')} d="M46 11 A39 39 0 0 1 85 50"/>
            <path ${accent()} d="M78 43 L85 51 L92 43"/>`,
    },
    trends: {
        from: '#45b0be',
        to: '#277890',
        glyph: `
            <rect x="19" y="52" width="14" height="26" rx="4" fill="${GLYPH}"/>
            <rect x="41" y="38" width="14" height="40" rx="4" fill="${GLYPH}"/>
            <rect x="63" y="24" width="14" height="54" rx="4" fill="${GLYPH}"/>
            <path ${accent()} d="M19 40 L40 24 L55 29 L80 11"/>`,
    },
    settings: {
        from: '#8497ad',
        to: '#53667c',
        glyph: `
            <circle cx="48" cy="48" r="31" fill="none" stroke="${GLYPH}" stroke-width="11" stroke-dasharray="9.740 9.740"/>
            <circle cx="48" cy="48" r="23" ${stroke()}/>
            <circle cx="48" cy="48" r="9" fill="${ACCENT}"/>`,
    },
    log: {
        from: '#7499b8',
        to: '#46678a',
        glyph: `
            <rect x="22" y="13" width="52" height="70" rx="9" ${stroke()}/>
            <path ${accent()} d="M34 33 H62 M34 47 H62 M34 61 H50"/>`,
    },
    exit: {
        from: '#8d99ab',
        to: '#586579',
        glyph: `
            <path ${stroke()} d="M32 24 A29 29 0 1 0 64 24"/>
            <path ${accent()} d="M48 12 V46"/>`,
    },
    about: {
        from: '#609ae0',
        to: '#3862b5',
        glyph: `
            <circle cx="48" cy="48" r="32" ${stroke()}/>
            <circle cx="48" cy="33" r="4.500" fill="${GLYPH}"/>
            <path ${accent()} d="M48 45 V66"/>`,
    },
};

function tileSvg(name, { size = 96, rounded = false } = {}) {
    const tile = TILES[name];
    const gradientId = `grad-${name}`;
    const background = rounded
        ? `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tile.from}"/><stop offset="1" stop-color="${tile.to}"/></linearGradient></defs>
           <rect width="96" height="96" rx="22" fill="url(#${gradientId})"/>`
        : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">${background}${tile.glyph}</svg>`;
}

export { TILES, tileSvg };

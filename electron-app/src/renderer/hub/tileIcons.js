// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const WHITE = 'stroke="#fff" fill="none" stroke-linecap="round" stroke-linejoin="round"';

const alertBadge = (ring, disc, mark) => `
    <circle cx="50" cy="50" r="47" fill="${ring}"/>
    <circle cx="50" cy="50" r="41" fill="#f4dfb4"/>
    <circle cx="50" cy="50" r="37" fill="${disc}"/>
    <path d="M50 28 L72 66 Q74 70 70 70 L30 70 Q26 70 28 66 Z" fill="#fff" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/>
    <rect x="47.5" y="41" width="5" height="14" rx="2.5" fill="${mark}"/>
    <circle cx="50" cy="62" r="3" fill="${mark}"/>`;

const TILES = {
    status: `
        <circle cx="50" cy="50" r="48" fill="#3f6b3a"/>
        <circle cx="50" cy="50" r="42" fill="#5d9250"/>
        <path d="M50 25 L71 33 V50 C71 63 61 71 50 76 C39 71 29 63 29 50 V33 Z" ${WHITE} stroke-width="5"/>
        <polyline points="37,52 44,52 48,44 54,60 58,52 63,52" ${WHITE} stroke-width="4"/>`,
    statusAlert: alertBadge('#8f2f22', '#b94a32', '#8f2f22'),
    statusYellow: alertBadge('#a8680d', '#d9962a', '#a8680d'),
    liveMap: `
        <circle cx="50" cy="50" r="48" fill="#35547c"/>
        <circle cx="50" cy="50" r="42" fill="#5580b3"/>
        <path d="M50 75 C40 63 34 55 34 46 A16 16 0 0 1 66 46 C66 55 60 63 50 75 Z" fill="#fff"/>
        <circle cx="50" cy="46" r="6" fill="#5580b3"/>`,
    forecast: `
        <circle cx="50" cy="50" r="48" fill="#a8680d"/>
        <circle cx="50" cy="50" r="42" fill="#d9962a"/>
        <circle cx="50" cy="50" r="20" ${WHITE} stroke-width="5"/>
        <path d="M50 38 V50 L58 56" ${WHITE} stroke-width="5"/>`,
    trends: `
        <circle cx="50" cy="50" r="48" fill="#8f2f22"/>
        <circle cx="50" cy="50" r="42" fill="#b94a32"/>
        <polyline points="29,66 41,52 51,58 70,35" ${WHITE} stroke-width="6"/>
        <polyline points="60,35 70,35 70,45" ${WHITE} stroke-width="6"/>`,
    settings: `
        <circle cx="50" cy="50" r="48" fill="#5b6470"/>
        <circle cx="50" cy="50" r="42" fill="#7d8794"/>
        <line x1="30" y1="37" x2="70" y2="37" ${WHITE} stroke-width="5"/>
        <line x1="30" y1="50" x2="70" y2="50" ${WHITE} stroke-width="5"/>
        <line x1="30" y1="63" x2="70" y2="63" ${WHITE} stroke-width="5"/>
        <circle cx="43" cy="37" r="6" fill="#fff" stroke="#7d8794" stroke-width="3"/>
        <circle cx="58" cy="50" r="6" fill="#fff" stroke="#7d8794" stroke-width="3"/>
        <circle cx="40" cy="63" r="6" fill="#fff" stroke="#7d8794" stroke-width="3"/>`,
    log: `
        <circle cx="50" cy="50" r="48" fill="#4a5670"/>
        <circle cx="50" cy="50" r="42" fill="#6b7a99"/>
        <rect x="33" y="27" width="34" height="46" rx="6" ${WHITE} stroke-width="5"/>
        <line x1="40" y1="40" x2="60" y2="40" ${WHITE} stroke-width="4"/>
        <line x1="40" y1="50" x2="60" y2="50" ${WHITE} stroke-width="4"/>
        <line x1="40" y1="60" x2="53" y2="60" ${WHITE} stroke-width="4"/>`,
    exit: `
        <circle cx="50" cy="50" r="48" fill="#7b828c"/>
        <circle cx="50" cy="50" r="42" fill="#4b5058"/>
        <path d="M38 36 A20 20 0 1 0 62 36" ${WHITE} stroke-width="5.5"/>
        <line x1="50" y1="26" x2="50" y2="50" ${WHITE} stroke-width="5.5"/>`,
    about: `
        <circle cx="50" cy="50" r="48" fill="#66543f"/>
        <circle cx="50" cy="50" r="42" fill="#8a7560"/>
        <circle cx="50" cy="31" r="6" fill="#fff"/>
        <rect x="44" y="42" width="12" height="31" rx="5" fill="#fff"/>`,
};

function tileSvg(name, { size = 96 } = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${TILES[name]}</svg>`;
}

export { TILES, tileSvg };

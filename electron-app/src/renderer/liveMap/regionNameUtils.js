// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { OBLAST_EN_BY_UK } from './regionLabels.js';
import { RAION_EN_BY_UK } from './raionLabels.js';

// This exact mixed Latin/Cyrillic string is genuinely what locations.json stores (uid 29) for
// Crimea - not a rendering artifact or a typo to "fix".
const CRIMEA_RAW_NAME = 'Aвmoнoмнa Pecпублiкa Kpuм';

function normalizeOblastName(name) {
    if (name === CRIMEA_RAW_NAME) return 'Крим';
    // Kyiv city is its own oblast-equivalent admin unit, named "м. Київ" ("city Kyiv") rather
    // than "Х область" like every other entry here - stripped to plain "Київ" so it matches
    // OBLAST_EN_BY_UK's key and oblastDisplayName's own special case below.
    if (name === 'м. Київ') return 'Київ';
    return name.replace(/\s*область\s*$/u, '').trim();
}

function normalizeRaionName(name) {
    return name
        .replace(/\s*район\s*$/u, '')
        .replace(/[’ʼ]/g, "'")
        .trim();
}

function oblastDisplayName(name, isEnglish) {
    if (name === 'Крим') return isEnglish ? 'Crimea' : name;
    // A city, not a region - "Kyiv Region" would be wrong (that's Kyiv Oblast, the separate
    // surrounding entity). "Kyiv City" specifically, not plain "Kyiv" - the explicit "City" is
    // what keeps it unambiguous next to "Kyiv Oblast" in the same list. The Ukrainian side needs
    // its "м. " prefix back, since the generic "${name} область" case below doesn't apply to a
    // city either.
    if (name === 'Київ') return isEnglish ? 'Kyiv City' : 'м. Київ';
    if (isEnglish) {
        // OBLAST_EN_BY_UK's Kyiv entry is "Kyiv Oblast" - stripped here so this doesn't end up
        // appending " Region" onto an already-suffixed name.
        const en = (OBLAST_EN_BY_UK.get(name) || name).replace(/\s+Oblast$/i, '');
        return `${en} Region`;
    }
    return `${name} область`;
}

function raionDisplayName(name, isEnglish) {
    if (isEnglish) return `${RAION_EN_BY_UK.get(name) || name} District`;
    return `${name} район`;
}

export { normalizeOblastName, normalizeRaionName, oblastDisplayName, raionDisplayName, CRIMEA_RAW_NAME };

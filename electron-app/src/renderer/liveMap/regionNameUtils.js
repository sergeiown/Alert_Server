// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { OBLAST_EN_BY_UK } from './regionLabels.js';
import { RAION_EN_BY_UK } from './raionLabels.js';

const CRIMEA_RAW_NAME = 'Aвmoнoмнa Pecпублiкa Kpuм';

function normalizeOblastName(name) {
    if (name === CRIMEA_RAW_NAME) return 'Крим';

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

    if (name === 'Київ') return isEnglish ? 'Kyiv City' : 'м. Київ';
    if (isEnglish) {

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

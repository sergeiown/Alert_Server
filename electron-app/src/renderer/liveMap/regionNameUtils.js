import { OBLAST_EN_BY_UK } from './regionLabels.js';
import { RAION_EN_BY_UK } from './raionLabels.js';

// locations.json's own uid 29 stores this exact mixed Latin/Cyrillic string as its "stateName" -
// not a rendering artifact, that's genuinely what's in the app's real data file for Crimea (it
// also covers Sevastopol - alerts.in.ua tracks them as one combined entity, matching the "Крим"
// label used elsewhere on this map).
const CRIMEA_RAW_NAME = 'Aвmoнoмнa Pecпублiкa Kpuм';

function normalizeOblastName(name) {
    if (name === CRIMEA_RAW_NAME) return 'Крим';
    return name.replace(/\s*область\s*$/u, '').trim();
}

function normalizeRaionName(name) {
    return name
        .replace(/\s*район\s*$/u, '')
        .replace(/[’ʼ]/g, "'")
        .trim();
}

// The inverse of the two normalizers above - used wherever a bare short name (the only form the
// border/label data itself stores) is shown to the user, so "Харківська" and "Харківський" don't
// read as the same word at a glance when a popup could name either one. Crimea isn't an oblast, so
// it's left bare rather than getting a (wrong) "область"/"Oblast" tacked on. `isEnglish` also
// swaps in the same curated English name the map's own labels use (OBLAST_EN_BY_UK/RAION_EN_BY_UK)
// instead of leaving the click-popup stuck in Ukrainian regardless of the app's language setting.
function oblastDisplayName(name, isEnglish) {
    if (name === 'Крим') return isEnglish ? 'Crimea' : name;
    if (isEnglish) {
        // OBLAST_EN_BY_UK's own Kyiv entry is "Kyiv Oblast" (that map label needs it, to tell
        // Kyiv oblast apart from Kyiv city at the same zoom) - stripped here so this doesn't end
        // up appending " Region" onto an already-suffixed name.
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

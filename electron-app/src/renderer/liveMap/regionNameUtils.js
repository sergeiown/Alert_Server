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

export { normalizeOblastName, normalizeRaionName, CRIMEA_RAW_NAME };

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
// it's left bare rather than getting a (wrong) "область" tacked on.
function oblastDisplayName(name) {
    if (name === 'Крим') return name;
    return `${name} область`;
}

function raionDisplayName(name) {
    return `${name} район`;
}

export { normalizeOblastName, normalizeRaionName, oblastDisplayName, raionDisplayName, CRIMEA_RAW_NAME };

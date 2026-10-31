const RAION_RENAMES = {
    'Володимир-Волинський': 'Володимирський',
    'Новоград-Волинський': 'Звягельський',
    'Сєвєродонецький': 'Сіверськодонецький',
    'Червоноградський': 'Шептицький',
    'Красноградський': 'Берестинський',
    'Новомосковський': 'Самарівський',
};

function normalizeRaionName(name) {
    const plain = name
        .replace(/\s*район\s*$/u, '')
        .replace(/[’ʼ]/g, "'")
        .trim();
    return RAION_RENAMES[plain] || plain;
}

export { RAION_RENAMES, normalizeRaionName };

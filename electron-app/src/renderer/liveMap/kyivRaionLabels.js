// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { KYIV_RAION_BORDERS } from './kyivRaionBorders.js';

// English names aren't sourced from OSM here (unlike raionLabels.js's hand-curated nationwide
// list) - transliterated once, by hand, just for these 10.
const EN_BY_UK = {
    Голосіївський: 'Holosiivskyi',
    'Солом’янський': 'Solomianskyi',
    Святошинський: 'Sviatoshynskyi',
    Дарницький: 'Darnytskyi',
    Дніпровський: 'Dniprovskyi',
    Деснянський: 'Desnianskyi',
    Оболонський: 'Obolonskyi',
    Подільський: 'Podilskyi',
    Печерський: 'Pecherskyi',
    Шевченківський: 'Shevchenkivskyi',
};

// No hand-picked label position exists for these (unlike raionLabels.js's nationwide list) - the
// centroid of the district's own polygon is a good enough stand-in at this scale, and avoids
// maintaining yet another set of coordinates in parallel with the border data itself.
function centroid(ring) {
    const [latSum, lngSum] = ring.reduce(([lat, lng], [pointLat, pointLng]) => [lat + pointLat, lng + pointLng], [0, 0]);
    return [latSum / ring.length, lngSum / ring.length];
}

function buildKyivRaionGroup(language) {
    const layer = L.layerGroup();
    const isEnglish = language === 'English';

    Object.entries(KYIV_RAION_BORDERS).forEach(([name, ring]) => {
        const [lat, lng] = centroid(ring);
        L.marker([lat, lng], {
            // Leaflet sets its own inline "transform" on this element, which would clobber a
            // centering transform applied here too - so the text lives in an inner span instead
            // (same approach raionLabels.js uses for the same reason).
            icon: L.divIcon({
                className: 'map-label-anchor',
                html: `<span class="raion-label">${isEnglish ? `${EN_BY_UK[name]} District` : `${name} район`}</span>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
            }),
            interactive: false,
        }).addTo(layer);
    });

    return layer;
}

export { buildKyivRaionGroup };

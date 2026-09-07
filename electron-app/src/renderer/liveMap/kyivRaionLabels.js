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

// No hand-picked label position exists for these (unlike raionLabels.js's nationwide list) - a
// true AREA centroid of the district's own polygon stands in instead (avoids maintaining yet
// another set of coordinates in parallel with the border data itself). A plain average of the
// ring's own points would skew toward whichever stretch of the border happens to have the most
// vertices (a wiggly bit of river-following boundary, say) rather than sitting at the shape's real
// center of mass - this is the standard polygon-centroid (shoelace) formula instead.
function centroid(ring) {
    const points = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]];

    let area = 0;
    let cLat = 0;
    let cLng = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const [lat0, lng0] = points[i];
        const [lat1, lng1] = points[i + 1];
        const cross = lng0 * lat1 - lng1 * lat0;
        area += cross;
        cLng += (lng0 + lng1) * cross;
        cLat += (lat0 + lat1) * cross;
    }
    area /= 2;

    // A degenerate (near-zero-area) ring would divide by ~0 - falls back to a plain vertex average
    // rather than producing NaN/Infinity.
    if (Math.abs(area) < 1e-9) {
        const [latSum, lngSum] = ring.reduce(([lat, lng], [pointLat, pointLng]) => [lat + pointLat, lng + pointLng], [0, 0]);
        return [latSum / ring.length, lngSum / ring.length];
    }

    return [cLat / (6 * area), cLng / (6 * area)];
}

function buildKyivRaionGroup(language) {
    const layer = L.layerGroup();
    const isEnglish = language === 'English';

    Object.entries(KYIV_RAION_BORDERS).forEach(([name, ring]) => {
        const [lat, lng] = centroid(ring);
        L.marker([lat, lng], {
            // Leaflet sets its own inline "transform" on this element, which would clobber a
            // centering transform applied here too - so the text lives in an inner span instead
            // (same approach raionLabels.js uses for the same reason). Its own class (not the
            // nationwide ".raion-label") - centered fully on the point rather than sitting above
            // it, and sized for being the only label on screen rather than one of many at a
            // country-wide zoom.
            icon: L.divIcon({
                className: 'map-label-anchor',
                html: `<span class="kyiv-raion-label">${isEnglish ? `${EN_BY_UK[name]} District` : `${name} район`}</span>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
            }),
            interactive: false,
        }).addTo(layer);
    });

    return layer;
}

export { buildKyivRaionGroup };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const REGIONS = [
    { lat: 48.92, lng: 28.685, uk: 'Вінницька', en: 'Vinnytsia' },
    { lat: 51.191, lng: 24.87, uk: 'Волинська', en: 'Volyn', size: 'small' },
    { lat: 48.301, lng: 34.844, uk: 'Дніпропетровська', en: 'Dnipropetrovsk' },
    { lat: 48.047, lng: 37.674, uk: 'Донецька', en: 'Donetsk' },
    { lat: 50.64, lng: 28.476, uk: 'Житомирська', en: 'Zhytomyr' },
    { lat: 48.404, lng: 23.275, uk: 'Закарпатська', en: 'Zakarpattia', size: 'small' },
    { lat: 47.271, lng: 35.703, uk: 'Запорізька', en: 'Zaporizhzhia' },
    { lat: 48.701, lng: 24.62, uk: 'Івано-Франківська', en: 'Ivano-Frankivsk', size: 'small' },
    { lat: 50.302, lng: 30.459, uk: 'Київська', en: 'Kyiv Oblast' },
    { lat: 48.473, lng: 32.082, uk: 'Кіровоградська', en: 'Kirovohrad', size: 'small' },
    { lat: 48.985, lng: 39.018, uk: 'Луганська', en: 'Luhansk' },
    { lat: 49.718, lng: 23.918, uk: 'Львівська', en: 'Lviv' },
    { lat: 50.45, lng: 30.52, uk: 'Київ', en: 'Kyiv', size: 'tiny' },
    { lat: 47.448, lng: 31.778, uk: 'Миколаївська', en: 'Mykolaiv' },
    { lat: 46.731, lng: 29.861, uk: 'Одеська', en: 'Odesa' },
    { lat: 49.732, lng: 33.778, uk: 'Полтавська', en: 'Poltava' },
    { lat: 51.04, lng: 26.391, uk: 'Рівненська', en: 'Rivne', size: 'small' },
    { lat: 51.106, lng: 34.124, uk: 'Сумська', en: 'Sumy' },
    { lat: 49.402, lng: 25.649, uk: 'Тернопільська', en: 'Ternopil', size: 'small' },
    { lat: 49.615, lng: 36.504, uk: 'Харківська', en: 'Kharkiv' },
    { lat: 46.7, lng: 33.561, uk: 'Херсонська', en: 'Kherson' },
    { lat: 49.508, lng: 26.929, uk: 'Хмельницька', en: 'Khmelnytskyi', size: 'small' },
    { lat: 49.26, lng: 31.352, uk: 'Черкаська', en: 'Cherkasy', size: 'small' },
    { lat: 48.268, lng: 25.978, uk: 'Чернівецька', en: 'Chernivtsi', size: 'small' },
    { lat: 51.355, lng: 32.003, uk: 'Чернігівська', en: 'Chernihiv' },
    { lat: 45.309, lng: 34.35, uk: 'Крим', en: 'Crimea', size: 'tiny' },
];

const OBLAST_EN_BY_UK = new Map(REGIONS.map((region) => [region.uk, region.en]));

// Kept as its own copy rather than importing oblastDisplayName from regionNameUtils.js, since that
// module imports OBLAST_EN_BY_UK from this file - importing back would create a cycle.
function regionLabelText(region, isEnglish) {
    if (!isEnglish) return region.uk;
    if (region.uk === 'Крим' || region.uk === 'Київ') return region.en;
    return `${region.en.replace(/\s+Oblast$/i, '')} Region`;
}

function buildOblastGroup(language) {
    const layer = L.layerGroup();
    const isEnglish = language === 'English';

    REGIONS.forEach((region) => {
        const sizeClass = region.size ? ` region-label-${region.size}` : '';
        // Leaflet sets its own inline "transform" on this element, which would clobber a
        // centering transform applied here too - so the text lives in an inner span instead.
        L.marker([region.lat, region.lng], {
            icon: L.divIcon({
                className: 'map-label-anchor',
                html: `<span class="region-label${sizeClass}">${regionLabelText(region, isEnglish)}</span>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
            }),
            interactive: false,
        }).addTo(layer);
    });

    return layer;
}

export { buildOblastGroup, OBLAST_EN_BY_UK };

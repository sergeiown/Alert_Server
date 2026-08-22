// Approximate label points (oblast capital or near-centroid, not survey-accurate) and short
// display names per language - locations.json's own names include the "область"/"region" suffix
// and, for Crimea, a garbled source string, so these are curated separately for tidy map labels.
// `size` shrinks the font for oblasts (and Kyiv city, and Crimea at this map's scale) whose real
// shape is too small/narrow for the default size to stay inside it - there's no polygon data here
// to measure against, so this is a curated approximation, not a computed fit.
const REGIONS = [
    { lat: 49.23, lng: 28.48, uk: 'Вінницька', en: 'Vinnytsia' },
    { lat: 50.75, lng: 25.32, uk: 'Волинська', en: 'Volyn', size: 'small' },
    { lat: 48.46, lng: 35.04, uk: 'Дніпропетровська', en: 'Dnipropetrovsk' },
    { lat: 48.3, lng: 37.6, uk: 'Донецька', en: 'Donetsk' },
    { lat: 50.25, lng: 28.66, uk: 'Житомирська', en: 'Zhytomyr' },
    { lat: 48.62, lng: 22.3, uk: 'Закарпатська', en: 'Zakarpattia', size: 'small' },
    { lat: 47.85, lng: 35.14, uk: 'Запорізька', en: 'Zaporizhzhia' },
    { lat: 48.92, lng: 24.71, uk: 'Івано-Франківська', en: 'Ivano-Frankivsk', size: 'small' },
    { lat: 50.6, lng: 30.9, uk: 'Київська', en: 'Kyiv Oblast' },
    { lat: 48.51, lng: 32.26, uk: 'Кіровоградська', en: 'Kirovohrad', size: 'small' },
    { lat: 48.9, lng: 38.4, uk: 'Луганська', en: 'Luhansk' },
    { lat: 49.84, lng: 24.03, uk: 'Львівська', en: 'Lviv' },
    { lat: 50.45, lng: 30.52, uk: 'Київ', en: 'Kyiv', size: 'tiny' },
    { lat: 46.97, lng: 32.0, uk: 'Миколаївська', en: 'Mykolaiv' },
    { lat: 46.48, lng: 30.72, uk: 'Одеська', en: 'Odesa' },
    { lat: 49.59, lng: 34.55, uk: 'Полтавська', en: 'Poltava' },
    { lat: 50.62, lng: 26.25, uk: 'Рівненська', en: 'Rivne', size: 'small' },
    { lat: 50.91, lng: 34.8, uk: 'Сумська', en: 'Sumy' },
    { lat: 49.55, lng: 25.59, uk: 'Тернопільська', en: 'Ternopil', size: 'small' },
    { lat: 49.99, lng: 36.23, uk: 'Харківська', en: 'Kharkiv' },
    { lat: 46.64, lng: 32.62, uk: 'Херсонська', en: 'Kherson' },
    { lat: 49.42, lng: 26.99, uk: 'Хмельницька', en: 'Khmelnytskyi', size: 'small' },
    { lat: 49.44, lng: 32.06, uk: 'Черкаська', en: 'Cherkasy', size: 'small' },
    { lat: 48.29, lng: 25.94, uk: 'Чернівецька', en: 'Chernivtsi', size: 'small' },
    { lat: 51.5, lng: 31.29, uk: 'Чернігівська', en: 'Chernihiv' },
    { lat: 45.03, lng: 34.1, uk: 'Крим', en: 'Crimea', size: 'tiny' },
];

function buildOblastGroup(language) {
    const layer = L.layerGroup();
    const isEnglish = language === 'English';

    REGIONS.forEach((region) => {
        const sizeClass = region.size ? ` region-label-${region.size}` : '';
        L.marker([region.lat, region.lng], {
            icon: L.divIcon({
                className: `region-label${sizeClass}`,
                html: isEnglish ? region.en : region.uk,
                iconSize: null,
            }),
            interactive: false,
        }).addTo(layer);
    });

    return layer;
}

export { buildOblastGroup };

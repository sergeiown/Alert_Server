import { CITY_BORDERS } from './cityBorders.js';
import { getOblastStartedAt } from './alertedRegionsStore.js';
import { alertPopupHtml } from './alertPopup.js';

// Major Ukrainian cities - standard city-center coordinates (not derived from any polygon
// dataset, unlike the oblast/raion labels - cities are simple point locations, not shapes to
// center on). Covers all 24 oblast capitals plus Kyiv, Sevastopol, Simferopol, and a handful of
// other large cities that aren't a capital (Kryvyi Rih, Mariupol, Makiivka, Kramatorsk, Kamianske,
// Melitopol, Bila Tserkva, Sievierodonetsk). The label point still anchors the text even for
// cities that also get a real outline (below) - the outline's own shape is too irregular to
// reliably center text inside.
//
// `oblast` is the key into the SAME alert-status data the oblast-coloring layer uses (matching
// OBLAST_BORDERS/regionLabels.js's short names) - alerts.in.ua doesn't track most of these cities
// as their own entity, so clicking one shows its containing oblast's status, not the city's own
// (Kyiv and Sevastopol are the exceptions - both are tracked as their own entity, "м. Київ" and
// the combined Crimea entry respectively, so those two get an exact, not inherited, status).
const CITIES = [
    { lat: 50.4501, lng: 30.5234, uk: 'Київ', en: 'Kyiv', oblast: 'м. Київ' },
    { lat: 49.9935, lng: 36.2304, uk: 'Харків', en: 'Kharkiv', oblast: 'Харківська' },
    { lat: 46.4825, lng: 30.7233, uk: 'Одеса', en: 'Odesa', oblast: 'Одеська' },
    { lat: 48.4647, lng: 35.0462, uk: 'Дніпро', en: 'Dnipro', oblast: 'Дніпропетровська' },
    { lat: 48.0159, lng: 37.8028, uk: 'Донецьк', en: 'Donetsk', oblast: 'Донецька' },
    { lat: 47.8388, lng: 35.1396, uk: 'Запоріжжя', en: 'Zaporizhzhia', oblast: 'Запорізька' },
    { lat: 49.8397, lng: 24.0297, uk: 'Львів', en: 'Lviv', oblast: 'Львівська' },
    { lat: 47.9105, lng: 33.3918, uk: 'Кривий Ріг', en: 'Kryvyi Rih', oblast: 'Дніпропетровська' },
    { lat: 46.975, lng: 31.9946, uk: 'Миколаїв', en: 'Mykolaiv', oblast: 'Миколаївська' },
    { lat: 47.0971, lng: 37.5434, uk: 'Маріуполь', en: 'Mariupol', oblast: 'Донецька' },
    { lat: 48.574, lng: 39.3078, uk: 'Луганськ', en: 'Luhansk', oblast: 'Луганська' },
    { lat: 49.2331, lng: 28.4682, uk: 'Вінниця', en: 'Vinnytsia', oblast: 'Вінницька' },
    { lat: 48.0475, lng: 37.9298, uk: 'Макіївка', en: 'Makiivka', oblast: 'Донецька' },
    { lat: 44.6054, lng: 33.522, uk: 'Севастополь', en: 'Sevastopol', oblast: 'Крим' },
    { lat: 44.9521, lng: 34.1024, uk: 'Сімферополь', en: 'Simferopol', oblast: 'Крим' },
    { lat: 51.4982, lng: 31.2893, uk: 'Чернігів', en: 'Chernihiv', oblast: 'Чернігівська' },
    { lat: 49.5883, lng: 34.5514, uk: 'Полтава', en: 'Poltava', oblast: 'Полтавська' },
    { lat: 46.6354, lng: 32.6169, uk: 'Херсон', en: 'Kherson', oblast: 'Херсонська' },
    { lat: 49.4229, lng: 26.9871, uk: 'Хмельницький', en: 'Khmelnytskyi', oblast: 'Хмельницька' },
    { lat: 49.4444, lng: 32.0598, uk: 'Черкаси', en: 'Cherkasy', oblast: 'Черкаська' },
    { lat: 48.2921, lng: 25.9358, uk: 'Чернівці', en: 'Chernivtsi', oblast: 'Чернівецька' },
    { lat: 50.2547, lng: 28.6587, uk: 'Житомир', en: 'Zhytomyr', oblast: 'Житомирська' },
    { lat: 50.9077, lng: 34.7981, uk: 'Суми', en: 'Sumy', oblast: 'Сумська' },
    { lat: 50.6199, lng: 26.2516, uk: 'Рівне', en: 'Rivne', oblast: 'Рівненська' },
    { lat: 48.9226, lng: 24.7111, uk: 'Івано-Франківськ', en: 'Ivano-Frankivsk', oblast: 'Івано-Франківська' },
    { lat: 48.5079, lng: 32.2623, uk: 'Кропивницький', en: 'Kropyvnytskyi', oblast: 'Кіровоградська' },
    { lat: 49.5535, lng: 25.5948, uk: 'Тернопіль', en: 'Ternopil', oblast: 'Тернопільська' },
    { lat: 50.7472, lng: 25.3254, uk: 'Луцьк', en: 'Lutsk', oblast: 'Волинська' },
    { lat: 48.6208, lng: 22.2879, uk: 'Ужгород', en: 'Uzhhorod', oblast: 'Закарпатська' },
    { lat: 46.8489, lng: 35.3675, uk: 'Мелітополь', en: 'Melitopol', oblast: 'Запорізька' },
    { lat: 48.7389, lng: 37.5848, uk: 'Краматорськ', en: 'Kramatorsk', oblast: 'Донецька' },
    { lat: 49.8092, lng: 30.1121, uk: 'Біла Церква', en: 'Bila Tserkva', oblast: 'Київська' },
    { lat: 48.9482, lng: 38.4936, uk: 'Сєвєродонецьк', en: 'Sievierodonetsk', oblast: 'Луганська' },
    { lat: 48.5111, lng: 34.6023, uk: "Кам'янське", en: 'Kamianske', oblast: 'Дніпропетровська' },
];

function buildCityGroup(strings, language) {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const color = isDark ? '#e2836f' : '#7a3b2e';
    const layer = L.layerGroup();
    const isEnglish = language === 'English';

    CITIES.forEach((city) => {
        const border = CITY_BORDERS[city.uk];
        const displayName = isEnglish ? city.en : city.uk;
        // Kyiv is tracked as its own entity ("м. Київ"), not inherited from anything broader -
        // every other city here only ever shows its containing oblast's status (see the CITIES
        // comment above), so the popup says so explicitly for those.
        const inheritedFromName = city.oblast === 'м. Київ' ? null : city.oblast;
        const popupContent = () =>
            alertPopupHtml(displayName, getOblastStartedAt(city.oblast), strings, language, inheritedFromName);

        // Cities with a real boundary get that outline instead of a plain dot - the dot is only
        // a fallback for the couple of cities with no hromada boundary in the source dataset.
        if (border) {
            L.polygon(border, {
                className: 'city-border',
                color,
                weight: 1.5,
                opacity: 0.7,
                fillColor: color,
                fillOpacity: 0.12,
            })
                .bindPopup(popupContent)
                .addTo(layer);
        }

        // A city with a real outline gets its popup from that polygon above - the label marker
        // itself stays non-interactive so it doesn't steal the click. The couple of cities with
        // no outline (dot fallback) get the popup here instead, since there's nothing else to
        // click.
        const marker = L.marker([city.lat, city.lng], {
            interactive: !border,
            // Same zero-size-anchor + absolutely-positioned-children technique as the oblast/raion
            // labels - Leaflet's own inline "transform" on the outer element would otherwise
            // clobber any centering transform placed directly on it.
            icon: L.divIcon({
                className: 'map-label-anchor',
                html: border
                    ? `<span class="city-label">${displayName}</span>`
                    : `<span class="city-dot"></span><span class="city-label">${displayName}</span>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
            }),
        }).addTo(layer);

        if (!border) marker.bindPopup(popupContent);
    });

    return layer;
}

export { buildCityGroup };

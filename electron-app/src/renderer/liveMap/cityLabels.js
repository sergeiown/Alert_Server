// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { CITY_BORDERS } from './cityBorders.js';
import {
    subscribe as subscribeAlertedRegions,
    getOblastStartedAt,
    getOblastAlertTypeName,
    getRaionStartedAt,
    getRaionAlertTypeName,
} from './alertedRegionsStore.js';
import { alertPopupHtml } from './alertPopup.js';
import { oblastDisplayName } from './regionNameUtils.js';

// `oblast`/`raion` are keys into the same alert-status data the oblast/raion-coloring layer uses
// (already normalized - see regionNameUtils.js). alerts.in.ua does not track most of these cities
// as their own entity, so a city shows its containing raion's status where it has one, falling
// back to its oblast's - Kyiv (no raion tier of its own) and Sevastopol (folded into Crimea) are
// the only two with `raion: null`, found to have no containing polygon in raionBorders.js's own
// data (tools/example/city-raion-lookup.js - point-in-polygon against the real raion shapes, not
// guessed from city/raion name similarity).
const CITIES = [
    { lat: 50.4501, lng: 30.5234, uk: 'Київ', en: 'Kyiv', oblast: 'Київ', raion: null },
    { lat: 49.9935, lng: 36.2304, uk: 'Харків', en: 'Kharkiv', oblast: 'Харківська', raion: 'Харківський' },
    { lat: 46.4825, lng: 30.7233, uk: 'Одеса', en: 'Odesa', oblast: 'Одеська', raion: 'Одеський' },
    { lat: 48.4647, lng: 35.0462, uk: 'Дніпро', en: 'Dnipro', oblast: 'Дніпропетровська', raion: 'Дніпровський' },
    { lat: 48.0159, lng: 37.8028, uk: 'Донецьк', en: 'Donetsk', oblast: 'Донецька', raion: 'Донецький' },
    { lat: 47.8388, lng: 35.1396, uk: 'Запоріжжя', en: 'Zaporizhzhia', oblast: 'Запорізька', raion: 'Запорізький' },
    { lat: 49.8397, lng: 24.0297, uk: 'Львів', en: 'Lviv', oblast: 'Львівська', raion: 'Львівський' },
    { lat: 47.9105, lng: 33.3918, uk: 'Кривий Ріг', en: 'Kryvyi Rih', oblast: 'Дніпропетровська', raion: 'Криворізький' },
    { lat: 46.975, lng: 31.9946, uk: 'Миколаїв', en: 'Mykolaiv', oblast: 'Миколаївська', raion: 'Миколаївський' },
    { lat: 47.0971, lng: 37.5434, uk: 'Маріуполь', en: 'Mariupol', oblast: 'Донецька', raion: 'Маріупольський' },
    { lat: 48.574, lng: 39.3078, uk: 'Луганськ', en: 'Luhansk', oblast: 'Луганська', raion: 'Луганський' },
    { lat: 49.2331, lng: 28.4682, uk: 'Вінниця', en: 'Vinnytsia', oblast: 'Вінницька', raion: 'Вінницький' },
    { lat: 48.0475, lng: 37.9298, uk: 'Макіївка', en: 'Makiivka', oblast: 'Донецька', raion: 'Донецький' },
    { lat: 44.6054, lng: 33.522, uk: 'Севастополь', en: 'Sevastopol', oblast: 'Крим', raion: null },
    { lat: 44.9521, lng: 34.1024, uk: 'Сімферополь', en: 'Simferopol', oblast: 'Крим', raion: 'Сімферопольський' },
    { lat: 51.4982, lng: 31.2893, uk: 'Чернігів', en: 'Chernihiv', oblast: 'Чернігівська', raion: 'Чернігівський' },
    { lat: 49.5883, lng: 34.5514, uk: 'Полтава', en: 'Poltava', oblast: 'Полтавська', raion: 'Полтавський' },
    { lat: 46.6354, lng: 32.6169, uk: 'Херсон', en: 'Kherson', oblast: 'Херсонська', raion: 'Херсонський' },
    { lat: 49.4229, lng: 26.9871, uk: 'Хмельницький', en: 'Khmelnytskyi', oblast: 'Хмельницька', raion: 'Хмельницький' },
    { lat: 49.4444, lng: 32.0598, uk: 'Черкаси', en: 'Cherkasy', oblast: 'Черкаська', raion: 'Черкаський' },
    { lat: 48.2921, lng: 25.9358, uk: 'Чернівці', en: 'Chernivtsi', oblast: 'Чернівецька', raion: 'Чернівецький' },
    { lat: 50.2547, lng: 28.6587, uk: 'Житомир', en: 'Zhytomyr', oblast: 'Житомирська', raion: 'Житомирський' },
    { lat: 50.9077, lng: 34.7981, uk: 'Суми', en: 'Sumy', oblast: 'Сумська', raion: 'Сумський' },
    { lat: 50.6199, lng: 26.2516, uk: 'Рівне', en: 'Rivne', oblast: 'Рівненська', raion: 'Рівненський' },
    {
        lat: 48.9226,
        lng: 24.7111,
        uk: 'Івано-Франківськ',
        en: 'Ivano-Frankivsk',
        oblast: 'Івано-Франківська',
        raion: 'Івано-Франківський',
    },
    { lat: 48.5079, lng: 32.2623, uk: 'Кропивницький', en: 'Kropyvnytskyi', oblast: 'Кіровоградська', raion: 'Кропивницький' },
    { lat: 49.5535, lng: 25.5948, uk: 'Тернопіль', en: 'Ternopil', oblast: 'Тернопільська', raion: 'Тернопільський' },
    { lat: 50.7472, lng: 25.3254, uk: 'Луцьк', en: 'Lutsk', oblast: 'Волинська', raion: 'Луцький' },
    { lat: 48.6208, lng: 22.2879, uk: 'Ужгород', en: 'Uzhhorod', oblast: 'Закарпатська', raion: 'Ужгородський' },
    { lat: 46.8489, lng: 35.3675, uk: 'Мелітополь', en: 'Melitopol', oblast: 'Запорізька', raion: 'Мелітопольський' },
    { lat: 48.7389, lng: 37.5848, uk: 'Краматорськ', en: 'Kramatorsk', oblast: 'Донецька', raion: 'Краматорський' },
    { lat: 49.8092, lng: 30.1121, uk: 'Біла Церква', en: 'Bila Tserkva', oblast: 'Київська', raion: 'Білоцерківський' },
    { lat: 48.9482, lng: 38.4936, uk: 'Сєвєродонецьк', en: 'Sievierodonetsk', oblast: 'Луганська', raion: 'Сєвєродонецький' },
    { lat: 48.5111, lng: 34.6023, uk: "Кам'янське", en: 'Kamianske', oblast: 'Дніпропетровська', raion: "Кам'янський" },
];

// A city is alerted if either its own raion or its oblast currently is - checking the oblast
// alone missed a raion-level-only alert entirely (e.g. Білоцерківський район on alert while the
// rest of Kyivska oblast isn't), leaving a genuinely alerted city showing no fill at all.
function resolveCityAlert(city) {
    const raionStartedAt = city.raion ? getRaionStartedAt(city.raion) : null;
    const oblastStartedAt = getOblastStartedAt(city.oblast);

    if (raionStartedAt && oblastStartedAt) {
        return new Date(raionStartedAt) <= new Date(oblastStartedAt)
            ? { startedAt: raionStartedAt, alertTypeName: getRaionAlertTypeName(city.raion), fromOblast: false }
            : { startedAt: oblastStartedAt, alertTypeName: getOblastAlertTypeName(city.oblast), fromOblast: true };
    }
    if (raionStartedAt) {
        return { startedAt: raionStartedAt, alertTypeName: getRaionAlertTypeName(city.raion), fromOblast: false };
    }
    if (oblastStartedAt) {
        return { startedAt: oblastStartedAt, alertTypeName: getOblastAlertTypeName(city.oblast), fromOblast: true };
    }
    return { startedAt: null, alertTypeName: null, fromOblast: false };
}

// The outline itself stays visible always (it's the city's landmark boundary, same idea as the
// dot/label) - only the fill is conditional on alert state. Zeroing weight/opacity together with
// fillOpacity (an earlier version of this fix) made the whole border vanish whenever a city had
// no active alert, instead of just clearing the red tint.
function borderStyle(color, alerted) {
    return {
        color,
        weight: 1.5,
        opacity: 0.7,
        fillColor: color,
        fillOpacity: alerted ? 0.12 : 0,
    };
}

function buildCityGroup(strings, language) {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const color = isDark ? '#e2836f' : '#7a3b2e';
    const layer = L.layerGroup();
    const isEnglish = language === 'English';
    // Tracked so the alert-state subscription below can restyle each border in place - this
    // group is built once by labelsLayer.js and reused for the window's lifetime (only shown/
    // hidden by zoom level, never rebuilt), so without this the fill would freeze at whatever
    // alert state happened to be live at map-open time.
    const borderPolygons = [];

    CITIES.forEach((city) => {
        const border = CITY_BORDERS[city.uk];
        const displayName = isEnglish ? city.en : city.uk;
        const popupContent = () => {
            const { startedAt, alertTypeName, fromOblast } = resolveCityAlert(city);
            // Only note "alert across the region" when the shown status came from the whole
            // oblast, not the city's own raion - a raion alert (Kyiv has none of its own, hence
            // the extra check) is already local to the city, nothing to disambiguate.
            const inheritedFromName =
                fromOblast && city.oblast !== 'Київ' ? oblastDisplayName(city.oblast, isEnglish) : null;
            return alertPopupHtml(displayName, startedAt, alertTypeName, strings, language, inheritedFromName);
        };

        if (border) {
            // Fill/stroke reflect the city's actual alert state (same on/off idea as
            // regionStatus.js's oblast/raion shading) - previously drawn with the alerted tint
            // unconditionally, making every city with a border shape look permanently alerted.
            const polygon = L.polygon(border, borderStyle(color, Boolean(resolveCityAlert(city).startedAt)))
                .bindPopup(popupContent)
                .addTo(layer);
            borderPolygons.push({ polygon, city });
        }

        const marker = L.marker([city.lat, city.lng], {
            interactive: !border,
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

    subscribeAlertedRegions(() => {
        borderPolygons.forEach(({ polygon, city }) => {
            polygon.setStyle(borderStyle(color, Boolean(resolveCityAlert(city).startedAt)));
        });
    });

    return layer;
}

export { buildCityGroup, CITIES };

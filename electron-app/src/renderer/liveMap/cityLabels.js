// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { CITY_BORDERS } from './cityBorders.js';
import { getOblastStartedAt, getOblastAlertTypeName } from './alertedRegionsStore.js';
import { alertPopupHtml } from './alertPopup.js';
import { oblastDisplayName } from './regionNameUtils.js';

// `oblast` is the key into the same alert-status data the oblast-coloring layer uses. alerts.in.ua
// does not track most of these cities as their own entity, so clicking one shows its containing
// oblast's status, not the city's own - Kyiv ("м. Київ") and Sevastopol (via the combined Crimea
// entry) are the only exceptions tracked as their own entity.
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
        const inheritedFromName = city.oblast === 'м. Київ' ? null : oblastDisplayName(city.oblast, isEnglish);
        const popupContent = () =>
            alertPopupHtml(
                displayName,
                getOblastStartedAt(city.oblast),
                getOblastAlertTypeName(city.oblast),
                strings,
                language,
                inheritedFromName
            );

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

    return layer;
}

export { buildCityGroup, CITIES };

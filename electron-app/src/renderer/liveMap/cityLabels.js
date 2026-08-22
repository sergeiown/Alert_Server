// Major Ukrainian cities - standard city-center coordinates (not derived from any polygon
// dataset, unlike the oblast/raion labels - cities are simple point locations, not shapes to
// center on). Covers all 24 oblast capitals plus Kyiv, Sevastopol, Simferopol, and a handful of
// other large cities that aren't a capital (Kryvyi Rih, Mariupol, Makiivka, Kramatorsk, Kamianske,
// Melitopol, Bila Tserkva, Sievierodonetsk).
const CITIES = [
    { lat: 50.4501, lng: 30.5234, uk: 'Київ', en: 'Kyiv' },
    { lat: 49.9935, lng: 36.2304, uk: 'Харків', en: 'Kharkiv' },
    { lat: 46.4825, lng: 30.7233, uk: 'Одеса', en: 'Odesa' },
    { lat: 48.4647, lng: 35.0462, uk: 'Дніпро', en: 'Dnipro' },
    { lat: 48.0159, lng: 37.8028, uk: 'Донецьк', en: 'Donetsk' },
    { lat: 47.8388, lng: 35.1396, uk: 'Запоріжжя', en: 'Zaporizhzhia' },
    { lat: 49.8397, lng: 24.0297, uk: 'Львів', en: 'Lviv' },
    { lat: 47.9105, lng: 33.3918, uk: 'Кривий Ріг', en: 'Kryvyi Rih' },
    { lat: 46.975, lng: 31.9946, uk: 'Миколаїв', en: 'Mykolaiv' },
    { lat: 47.0971, lng: 37.5434, uk: 'Маріуполь', en: 'Mariupol' },
    { lat: 48.574, lng: 39.3078, uk: 'Луганськ', en: 'Luhansk' },
    { lat: 49.2331, lng: 28.4682, uk: 'Вінниця', en: 'Vinnytsia' },
    { lat: 48.0475, lng: 37.9298, uk: 'Макіївка', en: 'Makiivka' },
    { lat: 44.6054, lng: 33.522, uk: 'Севастополь', en: 'Sevastopol' },
    { lat: 44.9521, lng: 34.1024, uk: 'Сімферополь', en: 'Simferopol' },
    { lat: 51.4982, lng: 31.2893, uk: 'Чернігів', en: 'Chernihiv' },
    { lat: 49.5883, lng: 34.5514, uk: 'Полтава', en: 'Poltava' },
    { lat: 46.6354, lng: 32.6169, uk: 'Херсон', en: 'Kherson' },
    { lat: 49.4229, lng: 26.9871, uk: 'Хмельницький', en: 'Khmelnytskyi' },
    { lat: 49.4444, lng: 32.0598, uk: 'Черкаси', en: 'Cherkasy' },
    { lat: 48.2921, lng: 25.9358, uk: 'Чернівці', en: 'Chernivtsi' },
    { lat: 50.2547, lng: 28.6587, uk: 'Житомир', en: 'Zhytomyr' },
    { lat: 50.9077, lng: 34.7981, uk: 'Суми', en: 'Sumy' },
    { lat: 50.6199, lng: 26.2516, uk: 'Рівне', en: 'Rivne' },
    { lat: 48.9226, lng: 24.7111, uk: 'Івано-Франківськ', en: 'Ivano-Frankivsk' },
    { lat: 48.5079, lng: 32.2623, uk: 'Кропивницький', en: 'Kropyvnytskyi' },
    { lat: 49.5535, lng: 25.5948, uk: 'Тернопіль', en: 'Ternopil' },
    { lat: 50.7472, lng: 25.3254, uk: 'Луцьк', en: 'Lutsk' },
    { lat: 48.6208, lng: 22.2879, uk: 'Ужгород', en: 'Uzhhorod' },
    { lat: 46.8489, lng: 35.3675, uk: 'Мелітополь', en: 'Melitopol' },
    { lat: 48.7389, lng: 37.5848, uk: 'Краматорськ', en: 'Kramatorsk' },
    { lat: 49.8092, lng: 30.1121, uk: 'Біла Церква', en: 'Bila Tserkva' },
    { lat: 48.9482, lng: 38.4936, uk: 'Сєвєродонецьк', en: 'Sievierodonetsk' },
    { lat: 48.5111, lng: 34.6023, uk: "Кам'янське", en: 'Kamianske' },
];

function buildCityGroup(language) {
    const layer = L.layerGroup();
    const isEnglish = language === 'English';

    CITIES.forEach((city) => {
        L.marker([city.lat, city.lng], {
            // Same zero-size-anchor + absolutely-positioned-children technique as the oblast/raion
            // labels - Leaflet's own inline "transform" on the outer element would otherwise
            // clobber any centering transform placed directly on it.
            icon: L.divIcon({
                className: 'map-label-anchor',
                html: `<span class="city-dot"></span><span class="city-label">${isEnglish ? city.en : city.uk}</span>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0],
            }),
            interactive: false,
        }).addTo(layer);
    });

    return layer;
}

export { buildCityGroup };

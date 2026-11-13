// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { leafletLayer, paintRules, labelRules, PolygonSymbolizer, CenteredTextSymbolizer } from 'protomaps-leaflet';
import { namedFlavor } from '@protomaps/basemaps';
import { PMTiles } from 'pmtiles';

const DARK = {
    ...namedFlavor('dark'),
    background: '#101720',
    earth: '#162030',
    park_a: '#1d2c26',
    park_b: '#20382c',
    wood_a: '#1c2b23',
    wood_b: '#1f3529',
    scrub_a: '#1f2a25',
    scrub_b: '#213028',
    hospital: '#262428',
    industrial: '#20242a',
    school: '#242229',
    pedestrian: '#242830',
    water: '#1b3a52',
    buildings: '#233044',
    minor_service_casing: '#0f1620',
    minor_casing: '#0f1620',
    link_casing: '#0f1620',
    major_casing_early: '#0f1620',
    major_casing_late: '#0f1620',
    highway_casing_early: '#0f1620',
    highway_casing_late: '#0f1620',
    other: '#3b414b',
    minor_service: '#3b414b',
    minor_a: '#4c535f',
    minor_b: '#454c57',
    link: '#5b6370',
    major: '#6c7583',
    highway: '#8792a3',
    railway: '#4a505b',
    boundaries: '#7b859a',
    roads_label_minor: '#8b93a1',
    roads_label_minor_halo: '#162030',
    roads_label_major: '#aab2c0',
    roads_label_major_halo: '#162030',
    subplace_label: '#9aa2b0',
    subplace_label_halo: '#162030',
    city_label: '#c5ccd8',
    city_label_halo: '#162030',
    ocean_label: '#7d8ba3',
    landcover: {
        grassland: 'rgba(29, 44, 36, 1)',
        barren: 'rgba(36, 38, 40, 1)',
        urban_area: 'rgba(30, 34, 40, 1)',
        farmland: 'rgba(30, 38, 34, 1)',
        glacier: 'rgba(43, 43, 43, 1)',
        scrub: 'rgba(32, 40, 34, 1)',
        forest: 'rgba(28, 44, 36, 1)',
    },
};

const LIGHT = {
    ...namedFlavor('light'),
    background: '#c9c0ab',
    earth: '#ddd5c2',
    water: '#a3b8c2',
    buildings: '#cfc6b0',
    highway: '#f1ece0',
    major: '#ebe5d7',
    link: '#ebe5d7',
    minor_a: '#e4dccb',
    minor_b: '#dfd7c5',
    minor_service: '#d9d0bc',
    other: '#d9d0bc',
};

const MAJOR_PLACES = ['city', 'town'];

const LABEL_FONT_FAMILY = "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif";
const LABEL_FONT_SAMPLE = 'Київ Kyiv';

if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
    ['400', '600', '700'].forEach((weight) => document.fonts.load(`${weight} 12px 'IBM Plex Sans'`, LABEL_FONT_SAMPLE).catch(() => {}));
}

function withPlexFont(rules) {
    rules.forEach((rule) => {
        const attr = rule.symbolizer && rule.symbolizer.font;
        if (!attr || !attr.font) return;
        const original = attr.font;
        attr.font =
            typeof original === 'function'
                ? (zoom, feature) => String(original(zoom, feature)).replace(/sans-serif/g, LABEL_FONT_FAMILY)
                : String(original).replace(/sans-serif/g, LABEL_FONT_FAMILY);
    });
    return rules;
}

const LANDMARK_KINDS = ['attraction', 'museum', 'theatre', 'zoo'];
const MAJOR_LANDMARK_MAX_MIN_ZOOM = 13;
const KNOWN_LANDMARKS = new Set([
    'Золоті ворота',
    'Національна опера України ім. Тараса Шевченка',
    'Національний академічний драматичний театр імені Івана Франка',
    'Національний академічний драматичний театр імені Лесі Українки',
    'Національний художній музей України',
    'Музей мистецтв ім. Ханенків',
    'Мистецький арсенал',
    'Київський річковий вокзал',
    'Національний музей історії України у Другій світовій війні',
    'Національний музей Тараса Шевченка',
    'Національний цирк України',
    'Музей історії Києва',
    'Музей Михайла Булгакова',
]);
const SQUARE_NAME = /(^|s)(площа|майдан|площадь|square)(s|$)/i;

function cityLabelRules(all, flavor, lang) {
    const places = all
        .filter((rule) => rule.dataLayer === 'places')
        .map((rule) => {
            const base = rule.filter;
            return { ...rule, filter: (zoom, feature) => (!base || base(zoom, feature)) && feature.props.kind !== 'locality' };
        });
    const roads = all.filter((rule) => rule.dataLayer === 'roads' && rule.minzoom >= 12);
    const bridgeSource = roads.find((rule) => rule.minzoom === 12);
    const bridges = bridgeSource
        ? [{ ...bridgeSource, minzoom: 13, filter: (zoom, feature) => feature.props.is_bridge === true || feature.props.is_bridge === 'true' || feature.props.kind_detail === 'bridge' }]
        : [];
    const labelProps = ['name:' + lang, 'name'];
    const darkMap = parseInt(String(flavor.background).slice(1, 3), 16) < 100;
    const fill = darkMap ? '#e6e9eb' : '#23282c';
    const stroke = darkMap ? '#0c0f12' : '#eef0f0';
    const landmarkSymbolizer = new CenteredTextSymbolizer({ labelProps, fill, stroke, width: 2, fontFamily: LABEL_FONT_FAMILY, fontSize: 12, fontWeight: 600 });
    const squares = [
        { dataLayer: 'roads', minzoom: 14, filter: (zoom, feature) => SQUARE_NAME.test(String(feature.props['name:' + lang] || feature.props.name || '')), symbolizer: landmarkSymbolizer },
    ];
    const landmarkName = (feature) => String(feature.props['name:uk'] || feature.props.name || '');
    const landmarks = [
        {
            dataLayer: 'pois',
            minzoom: 13,
            filter: (zoom, feature) => {
                if (!LANDMARK_KINDS.includes(feature.props.kind) || !landmarkName(feature)) return false;
                if (Number(feature.props.min_zoom) <= MAJOR_LANDMARK_MAX_MIN_ZOOM) return true;
                return zoom >= 14 && KNOWN_LANDMARKS.has(landmarkName(feature));
            },
            symbolizer: landmarkSymbolizer,
        },
    ];
    return [...places, ...roads, ...bridges, ...squares, ...landmarks];
}

function buildLabelRules(flavor, lang, labels, allZooms) {
    const all = withPlexFont(labelRules(flavor, lang));
    if (labels === true) return all;
    if (labels === 'city') return cityLabelRules(all, flavor, lang);
    if (labels !== 'places' && labels !== 'places-major' && labels !== 'places-inner') return [];

    return all
        .filter((rule) => rule.dataLayer === 'places' && (allZooms || rule.minzoom >= 9))
        .map((rule) => {
            if (labels === 'places-inner') {
                const base = rule.filter;
                return { ...rule, filter: (zoom, feature) => (!base || base(zoom, feature)) && feature.props.kind !== 'locality' };
            }
            if (labels !== 'places-major') return rule;
            const original = rule.filter;
            return { ...rule, filter: (zoom, feature) => (!original || original(zoom, feature)) && MAJOR_PLACES.includes(feature.props.kind_detail) };
        });
}

const SATELLITE_LIGHT = {
    sea: '#b5bbc0',
    forest: '#bfc1be',
    farmland: '#cecfcd',
    grassland: '#cacbc8',
    scrub: '#c4c6c3',
    heath: '#c7c8c5',
    marsh: '#bec2c3',
    swamp: '#bbc0c1',
    bare_rock: '#c1c1c0',
    glacier: '#d8dadb',
    residential: '#c1c1bf',
    water: '#b5bbc0',
};

const SATELLITE_DARK = {
    sea: '#12161a',
    forest: '#202326',
    farmland: '#292c2f',
    grassland: '#25282b',
    scrub: '#232629',
    heath: '#26292c',
    marsh: '#1f2427',
    swamp: '#1d2225',
    bare_rock: '#2b2d30',
    glacier: '#33373a',
    residential: '#2a2c2f',
    water: '#12161a',
};

const CLEAR = 'rgba(0, 0, 0, 0)';
const OVERLAY_CLEAR_KEYS = new Set([
    'background', 'earth', 'park_a', 'park_b', 'wood_a', 'wood_b', 'scrub_a', 'scrub_b', 'glacier', 'sand', 'beach', 'zoo',
    'military', 'hospital', 'industrial', 'school', 'pedestrian', 'aerodrome', 'runway', 'taxiway', 'airport',
]);

function overlayFlavor(flavor) {
    const result = { ...flavor };
    Object.keys(result).forEach((key) => {
        if (OVERLAY_CLEAR_KEYS.has(key)) result[key] = CLEAR;
    });
    result.landcover = Object.fromEntries(Object.keys(flavor.landcover || {}).map((key) => [key, CLEAR]));
    return result;
}

function satelliteFlavor(flavor, dark) {
    const palette = dark ? SATELLITE_DARK : SATELLITE_LIGHT;
    const urban = dark ? '#2a2c2f' : '#c1c1bf';
    const built = dark ? '#303236' : '#babab8';
    const green = dark ? '#222528' : '#bcbdba';
    const lawn = dark ? '#272a2d' : '#c9cac7';
    const result = {
        ...flavor,
        background: palette.sea,
        earth: urban,
        park_a: lawn,
        park_b: green,
        wood_a: green,
        wood_b: palette.forest,
        scrub_a: palette.scrub,
        scrub_b: palette.heath,
        glacier: palette.glacier,
        sand: palette.bare_rock,
        beach: palette.bare_rock,
        hospital: built,
        industrial: dark ? '#2e3033' : '#b8b8b6',
        school: built,
        pedestrian: built,
        buildings: dark ? '#34373a' : '#b3b3b1',
        water: palette.water,
        roads_label_major: dark ? '#c4c9cd' : '#262b30',
        roads_label_major_halo: dark ? '#0f1215' : '#eceeee',
        roads_label_minor: dark ? '#a3a9ae' : '#30363b',
        roads_label_minor_halo: dark ? '#0f1215' : '#eceeee',
        address_label: dark ? '#a3a9ae' : '#30363b',
        address_label_halo: dark ? '#0f1215' : '#eceeee',
        subplace_label: dark ? '#c4c9cd' : '#262b30',
        subplace_label_halo: dark ? '#0f1215' : '#eceeee',
        city_label: dark ? '#e6e9eb' : '#1f2428',
        city_label_halo: dark ? '#0f1215' : '#eceeee',
    };
    result.landcover = {
        grassland: palette.grassland,
        barren: palette.bare_rock,
        urban_area: urban,
        farmland: palette.farmland,
        glacier: palette.glacier,
        scrub: palette.scrub,
        forest: palette.forest,
    };
    return result;
}

const sharedSources = new Map();
const SHARED_TILE_LIMIT = 600;

function sharedSource(url) {
    if (typeof url !== 'string' || !/\.pmtiles(\?|$)/.test(url)) return url;
    if (sharedSources.has(url)) return sharedSources.get(url);
    const pm = new PMTiles(url);
    const pending = new Map();
    const source = {
        getHeader: (...args) => pm.getHeader(...args),
        getMetadata: (...args) => pm.getMetadata(...args),
        getZxy(z, x, y, signal) {
            const key = z + '/' + x + '/' + y;
            let entry = pending.get(key);
            if (!entry) {
                const controller = new AbortController();
                entry = { waiters: 0, controller, promise: pm.getZxy(z, x, y, controller.signal) };
                entry.promise.catch(() => pending.delete(key));
                pending.set(key, entry);
                if (pending.size > SHARED_TILE_LIMIT) pending.delete(pending.keys().next().value);
            }
            entry.waiters++;
            return new Promise((resolve, reject) => {
                let settled = false;
                const release = () => {
                    if (settled) return;
                    settled = true;
                    entry.waiters--;
                    if (entry.waiters <= 0 && signal && signal.aborted) {
                        entry.controller.abort();
                        pending.delete(key);
                    }
                };
                if (signal) {
                    if (signal.aborted) {
                        release();
                        reject(new DOMException('Aborted', 'AbortError'));
                        return;
                    }
                    signal.addEventListener('abort', () => {
                        release();
                        reject(new DOMException('Aborted', 'AbortError'));
                    }, { once: true });
                }
                entry.promise.then(
                    (value) => {
                        if (!settled) {
                            settled = true;
                            entry.waiters--;
                            resolve(value);
                        }
                    },
                    (error) => {
                        if (!settled) {
                            settled = true;
                            reject(error);
                        }
                    }
                );
            });
        },
    };
    sharedSources.set(url, source);
    return source;
}

const PRELOAD_RING_TILES = 1;

const MAX_LABELED_TILES = 4096;

function withPreload(layer) {
    if (layer.labelers) layer.labelers.maxLabeledTiles = MAX_LABELED_TILES;
    const original = layer._getTiledPixelBounds;
    if (typeof original !== 'function' || !window.L) return layer;
    layer.options.keepBuffer = Math.max(layer.options.keepBuffer || 2, PRELOAD_RING_TILES + 2);
    layer._getTiledPixelBounds = function (center) {
        const bounds = original.call(this, center);
        const ring = window.__alertPreloadRing === undefined ? PRELOAD_RING_TILES : window.__alertPreloadRing;
        const pad = this.getTileSize().x * ring;
        return window.L.bounds(bounds.min.subtract([pad, pad]), bounds.max.add([pad, pad]));
    };
    return layer;
}

function withAttribution(layer, attribution) {
    layer.options.attribution = attribution || '';
    return withPreload(layer);
}

function createSatellite({ url, dark, attribution, maxDataZoom = 10 }) {
    const palette = dark ? SATELLITE_DARK : SATELLITE_LIGHT;
    return withAttribution(leafletLayer({
        url,
        paintRules: [{ dataLayer: 'landcover', symbolizer: new PolygonSymbolizer({ fill: (zoom, feature) => palette[feature.props.kind] || palette.sea }) }],
        labelRules: [],
        backgroundColor: palette.sea,
        attribution,
        maxDataZoom,
    }), attribution);
}

function createRelief({ url, dark, attribution, maxDataZoom = 10 }) {
    const lightOpacity = dark ? 0.06 : 0.3;
    const shadeOpacity = dark ? 0.22 : 0.08;
    return withAttribution(
        leafletLayer({
            url,
            paintRules: [
                { dataLayer: 'hillshade-vectors', filter: (zoom, feature) => feature.props.shade === 'light', symbolizer: new PolygonSymbolizer({ fill: '#ffffff', opacity: lightOpacity }) },
                { dataLayer: 'hillshade-vectors', filter: (zoom, feature) => feature.props.shade === 'dark', symbolizer: new PolygonSymbolizer({ fill: '#000000', opacity: shadeOpacity }) },
            ],
            labelRules: [],
            backgroundColor: CLEAR,
            maxDataZoom,
        }),
        attribution
    );
}

function create({ url, dark, lang, attribution, labels = true, boundaries = true, maxDataZoom = 15, bounds, overlay = false, satellite = false, labelsAllZooms = false, part = 'all', pane }) {
    const base = dark ? DARK : LIGHT;
    const flavor = satellite ? satelliteFlavor(base, dark) : overlay ? overlayFlavor(base) : base;
    return withAttribution(leafletLayer({
        url: sharedSource(url),
        paintRules: part === 'labels' ? [] : paintRules(flavor).filter((rule) => boundaries || rule.dataLayer !== 'boundaries'),
        labelRules: part === 'paint' ? [] : buildLabelRules(flavor, lang, labels, labelsAllZooms),
        backgroundColor: part === 'labels' ? CLEAR : flavor.background,
        ...(pane ? { pane } : {}),
        attribution,
        maxDataZoom,
        bounds,
    }), attribution);
}

window.alertOsmBasemap = { create, createSatellite, createRelief };

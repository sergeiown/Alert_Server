// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { leafletLayer, paintRules, labelRules } from 'protomaps-leaflet';
import { namedFlavor } from '@protomaps/basemaps';

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

function buildLabelRules(flavor, lang, labels) {
    const all = withPlexFont(labelRules(flavor, lang));
    if (labels === true) return all;
    if (labels !== 'places' && labels !== 'places-major') return [];

    return all
        .filter((rule) => rule.dataLayer === 'places' && rule.minzoom >= 9)
        .map((rule) => {
            if (labels !== 'places-major') return rule;
            const original = rule.filter;
            return { ...rule, filter: (zoom, feature) => (!original || original(zoom, feature)) && MAJOR_PLACES.includes(feature.props.kind_detail) };
        });
}

function create({ url, dark, lang, attribution, labels = true, boundaries = true, maxDataZoom = 15, bounds }) {
    const flavor = dark ? DARK : LIGHT;
    return leafletLayer({
        url,
        paintRules: paintRules(flavor).filter((rule) => boundaries || rule.dataLayer !== 'boundaries'),
        labelRules: buildLabelRules(flavor, lang, labels),
        backgroundColor: flavor.background,
        attribution,
        maxDataZoom,
        bounds,
    });
}

window.alertOsmBasemap = { create };

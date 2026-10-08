// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { leafletLayer, paintRules, labelRules } from 'protomaps-leaflet';
import { namedFlavor } from '@protomaps/basemaps';

const DARK = {
    ...namedFlavor('dark'),
    background: '#15181d',
    earth: '#1b1f25',
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
    buildings: '#2c313a',
    minor_service_casing: '#14171b',
    minor_casing: '#14171b',
    link_casing: '#14171b',
    major_casing_early: '#14171b',
    major_casing_late: '#14171b',
    highway_casing_early: '#14171b',
    highway_casing_late: '#14171b',
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
    roads_label_minor_halo: '#1b1f25',
    roads_label_major: '#aab2c0',
    roads_label_major_halo: '#1b1f25',
    subplace_label: '#9aa2b0',
    subplace_label_halo: '#1b1f25',
    city_label: '#c5ccd8',
    city_label_halo: '#1b1f25',
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
    background: '#d9d6cf',
    earth: '#eceae4',
    water: '#a9d4e6',
    buildings: '#dcd7cd',
};

const MAJOR_PLACES = ['city', 'town'];

function buildLabelRules(flavor, lang, labels) {
    const all = labelRules(flavor, lang);
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

function create({ url, dark, lang, attribution, labels = true, boundaries = true, maxDataZoom = 15 }) {
    const flavor = dark ? DARK : LIGHT;
    return leafletLayer({
        url,
        paintRules: paintRules(flavor).filter((rule) => boundaries || rule.dataLayer !== 'boundaries'),
        labelRules: buildLabelRules(flavor, lang, labels),
        backgroundColor: flavor.background,
        attribution,
        maxDataZoom,
    });
}

window.alertOsmBasemap = { create };

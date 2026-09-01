// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { OBLAST_BORDERS } from './oblastBorders.js';
import { RAION_BORDERS } from './raionBorders.js';
import { CITY_BORDERS } from './cityBorders.js';
import {
    subscribe as subscribeAlertedRegions,
    getOblastStartedAt,
    getRaionStartedAt,
    getOblastAlertTypeName,
    getRaionAlertTypeName,
} from './alertedRegionsStore.js';
import { alertPopupHtml } from './alertPopup.js';
import { RAION_OBLAST } from './raionOblastMap.js';
import { RAION_MIN_ZOOM } from './zoomTiers.js';
import { oblastDisplayName, raionDisplayName } from './regionNameUtils.js';

const RESHADE_MS = 60000;
const TIER_MS = 30 * 60 * 1000;

const LIGHT_SHADES = ['#e6ac9f', '#e2a496', '#df9d8d', '#db9584', '#d68d7b', '#d18572'];
const DARK_SHADES = ['#5c3934', '#603b35', '#653e37', '#6a4139', '#70443b', '#76483d'];

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const SHADES = isDark ? DARK_SHADES : LIGHT_SHADES;
const ALERTED_FILL_OPACITY = isDark ? 0.5 : 0.32;
const NEUTRAL_COLOR = isDark ? '#3a4650' : '#7a8a94';
const NEUTRAL_FILL_OPACITY = isDark ? 0.06 : 0.05;

function shadeFor(startedAt, now) {
    const elapsed = now - new Date(startedAt).getTime();
    const tier = Math.min(SHADES.length - 1, Math.max(0, Math.floor(elapsed / TIER_MS)));
    return SHADES[tier];
}

const RegionStatusLayer = L.LayerGroup.extend({
    initialize: function (strings, language) {
        L.LayerGroup.prototype.initialize.call(this);
        this._strings = strings;
        this._language = language;
    },

    onAdd: function (map) {
        this._map = map;
        map.on('zoomend', this._render, this);
        this._unsubscribe = subscribeAlertedRegions(() => this._render());
        this._reshadeTimer = setInterval(() => this._render(), RESHADE_MS);
        this._render();
    },

    onRemove: function (map) {
        map.off('zoomend', this._render, this);
        if (this._unsubscribe) this._unsubscribe();
        if (this._reshadeTimer) clearInterval(this._reshadeTimer);
        // Overriding onRemove replaces L.LayerGroup's own version entirely rather than extending
        // it - this call is required or the base class's own "remove every child shape" behavior
        // never runs.
        L.LayerGroup.prototype.onRemove.call(this, map);
    },

    // `ownStartedAt` drives what's actually drawn; `popupStartedAt`/`popupAlertTypeName`/
    // `inheritedFromName` drive the popup text, which can differ (an inherited alert is shown in
    // the popup even when nothing is drawn to indicate it visually).
    _drawRegion: function (rings, displayName, ownStartedAt, now, popupStartedAt, popupAlertTypeName, inheritedFromName) {
        const alerted = Boolean(ownStartedAt);
        const color = alerted ? shadeFor(ownStartedAt, now) : NEUTRAL_COLOR;
        const { _strings: strings, _language: language } = this;

        L.polygon(rings, {
            className: 'alert-status-shape',
            color,
            weight: alerted ? 1 : 0,
            opacity: alerted ? 0.5 : 0,
            fillColor: color,
            fillOpacity: alerted ? ALERTED_FILL_OPACITY : NEUTRAL_FILL_OPACITY,
        })
            .bindPopup(() =>
                alertPopupHtml(displayName, popupStartedAt, popupAlertTypeName, strings, language, inheritedFromName)
            )
            .addTo(this);
    },

    _render: function () {
        this.clearLayers();
        const now = Date.now();
        const isEnglish = this._language === 'English';
        const raionTier = this._map.getZoom() >= RAION_MIN_ZOOM;

        Object.entries(OBLAST_BORDERS).forEach(([name, rings]) => {
            const startedAt = getOblastStartedAt(name);
            const alertTypeName = getOblastAlertTypeName(name);
            this._drawRegion(rings, oblastDisplayName(name, isEnglish), startedAt, now, startedAt, alertTypeName);
        });
        // Kyiv city has no oblast-tier polygon of its own (folded into Kyiv oblast's shape in the
        // source dataset), so its city outline stands in for it here.
        if (CITY_BORDERS['Київ']) {
            const startedAt = getOblastStartedAt('Київ');
            const alertTypeName = getOblastAlertTypeName('Київ');
            this._drawRegion([CITY_BORDERS['Київ']], oblastDisplayName('Київ', isEnglish), startedAt, now, startedAt, alertTypeName);
        }

        Object.entries(RAION_BORDERS).forEach(([name, ring]) => {
            const ownStartedAt = getRaionStartedAt(name);
            const ownAlertTypeName = getRaionAlertTypeName(name);
            const oblastKey = RAION_OBLAST[name];
            const oblastStartedAt = oblastKey ? getOblastStartedAt(oblastKey) : null;
            const oblastAlertTypeName = oblastKey ? getOblastAlertTypeName(oblastKey) : null;

            if (!raionTier) {
                if (ownStartedAt) {
                    // Skipped when the oblast is also alerted: the oblast's own fill already
                    // covers this ground while zoomed out, so drawing the raion too would double up.
                    if (!oblastStartedAt) {
                        this._drawRegion(
                            [ring],
                            raionDisplayName(name, isEnglish),
                            ownStartedAt,
                            now,
                            ownStartedAt,
                            ownAlertTypeName
                        );
                    }
                }
                return;
            }

            const inherited = !ownStartedAt;
            const inheritedStartedAt = inherited ? oblastStartedAt : null;
            this._drawRegion(
                [ring],
                raionDisplayName(name, isEnglish),
                ownStartedAt || inheritedStartedAt,
                now,
                ownStartedAt || inheritedStartedAt,
                inherited ? oblastAlertTypeName : ownAlertTypeName,
                inherited && inheritedStartedAt ? oblastDisplayName(oblastKey, isEnglish) : null
            );
        });
    },
});

function addRegionStatusLayer(map, strings, language) {
    return new RegionStatusLayer(strings, language).addTo(map);
}

export { addRegionStatusLayer };

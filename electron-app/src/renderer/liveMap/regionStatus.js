// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { OBLAST_BORDERS } from './oblastBorders.js';
import { RAION_BORDERS } from './raionBorders.js';
import { CITY_BORDERS } from './cityBorders.js';
import { KYIV_RAION_BORDERS } from './kyivRaionBorders.js';
import {
    subscribe as subscribeAlertedRegions,
    getOblastStartedAt,
    getRaionStartedAt,
    getOblastAlertTypeName,
    getRaionAlertTypeName,
    getOblastAlertLevel,
    getRaionAlertLevel,
    getKyivRaionStartedAt,
    getKyivRaionAlertLevel,
} from './alertedRegionsStore.js';
import { alertPopupHtml } from './alertPopup.js';
import { RAION_OBLAST } from './raionOblastMap.js';
import { RAION_MIN_ZOOM } from './zoomTiers.js';
import { oblastDisplayName, raionDisplayName } from './regionNameUtils.js';

const RESHADE_MS = 60000;
const TIER_MS = 30 * 60 * 1000;

// Two shade ladders, same "how long ago" tiering as before (lighter = just started, darker = has
// been going a while) - which one applies is now the alert's own red/yellow level (see
// regionAlertStatus.js's computeAlertedRegions, which now carries the worst level seen for that
// region alongside startedAt). Red is the pre-existing palette; yellow/amber is new. A region with
// no level reported at all (older cached source) falls back to the red ladder, matching the single
// color this map used before the three live sources started tagging alerts with a level.
const RED_LIGHT_SHADES = ['#e6ac9f', '#e2a496', '#df9d8d', '#db9584', '#d68d7b', '#d18572'];
const RED_DARK_SHADES = ['#5c3934', '#603b35', '#653e37', '#6a4139', '#70443b', '#76483d'];
const YELLOW_LIGHT_SHADES = ['#e8d59f', '#e6cf8f', '#e3c880', '#e0c270', '#ddbb61', '#dab551'];
const YELLOW_DARK_SHADES = ['#5c5230', '#605432', '#655735', '#6a5a37', '#705d39', '#76603b'];

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const RED_SHADES = isDark ? RED_DARK_SHADES : RED_LIGHT_SHADES;
const YELLOW_SHADES = isDark ? YELLOW_DARK_SHADES : YELLOW_LIGHT_SHADES;
const ALERTED_FILL_OPACITY = isDark ? 0.5 : 0.32;
const NEUTRAL_COLOR = isDark ? '#3a4650' : '#7a8a94';
const NEUTRAL_FILL_OPACITY = isDark ? 0.06 : 0.05;

function shadeFor(startedAt, now, alertLevel) {
    const shades = alertLevel === 'yellow' ? YELLOW_SHADES : RED_SHADES;
    const elapsed = now - new Date(startedAt).getTime();
    const tier = Math.min(shades.length - 1, Math.max(0, Math.floor(elapsed / TIER_MS)));
    return shades[tier];
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
    _drawRegion: function (rings, displayName, ownStartedAt, now, popupStartedAt, popupAlertTypeName, inheritedFromName, alertLevel) {
        const alerted = Boolean(ownStartedAt);
        const color = alerted ? shadeFor(ownStartedAt, now, alertLevel) : NEUTRAL_COLOR;
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
                alertPopupHtml(displayName, popupStartedAt, popupAlertTypeName, strings, language, inheritedFromName, alertLevel)
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
            const alertLevel = getOblastAlertLevel(name);
            this._drawRegion(rings, oblastDisplayName(name, isEnglish), startedAt, now, startedAt, alertTypeName, null, alertLevel);
        });
        // Kyiv city has no oblast-tier polygon of its own (folded into Kyiv oblast's shape in the
        // source dataset), so its city outline stands in for it here - except at the raion zoom
        // tier, where its own 10 districts are drawn individually instead (see below), the same way
        // every other tracked oblast shows its raions once zoomed in enough.
        if (CITY_BORDERS['Київ'] && !raionTier) {
            const startedAt = getOblastStartedAt('Київ');
            const alertTypeName = getOblastAlertTypeName('Київ');
            const alertLevel = getOblastAlertLevel('Київ');
            this._drawRegion([CITY_BORDERS['Київ']], oblastDisplayName('Київ', isEnglish), startedAt, now, startedAt, alertTypeName, null, alertLevel);
        }

        // Kyiv's own districts have no location_uid of their own in any live source - their status
        // comes from parsing free text instead (see regionAlertStatus.js's
        // computeKyivRaionStatuses), so there's no alertType to show for them specifically, only a
        // level. A district with no status of its own inherits the whole city's, the same way an
        // ordinary raion inherits its oblast's.
        if (raionTier) {
            const cityStartedAt = getOblastStartedAt('Київ');
            const cityAlertTypeName = getOblastAlertTypeName('Київ');
            const cityAlertLevel = getOblastAlertLevel('Київ');

            Object.entries(KYIV_RAION_BORDERS).forEach(([name, ring]) => {
                const ownStartedAt = getKyivRaionStartedAt(name);
                const ownAlertLevel = getKyivRaionAlertLevel(name);
                const inherited = !ownStartedAt;

                this._drawRegion(
                    [ring],
                    isEnglish ? `${name} District` : `${name} район`,
                    ownStartedAt || (inherited ? cityStartedAt : null),
                    now,
                    ownStartedAt || (inherited ? cityStartedAt : null),
                    inherited ? cityAlertTypeName : null,
                    inherited && cityStartedAt ? oblastDisplayName('Київ', isEnglish) : null,
                    inherited ? cityAlertLevel : ownAlertLevel
                );
            });
        }

        Object.entries(RAION_BORDERS).forEach(([name, ring]) => {
            const ownStartedAt = getRaionStartedAt(name);
            const ownAlertTypeName = getRaionAlertTypeName(name);
            const ownAlertLevel = getRaionAlertLevel(name);
            const oblastKey = RAION_OBLAST[name];
            const oblastStartedAt = oblastKey ? getOblastStartedAt(oblastKey) : null;
            const oblastAlertTypeName = oblastKey ? getOblastAlertTypeName(oblastKey) : null;
            const oblastAlertLevel = oblastKey ? getOblastAlertLevel(oblastKey) : null;

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
                            ownAlertTypeName,
                            null,
                            ownAlertLevel
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
                inherited && inheritedStartedAt ? oblastDisplayName(oblastKey, isEnglish) : null,
                inherited ? oblastAlertLevel : ownAlertLevel
            );
        });
    },
});

function addRegionStatusLayer(map, strings, language) {
    return new RegionStatusLayer(strings, language).addTo(map);
}

export { addRegionStatusLayer };

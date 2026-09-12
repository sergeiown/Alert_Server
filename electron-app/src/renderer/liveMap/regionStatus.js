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
    getOblastHasBothLevels,
    getRaionHasBothLevels,
    getOblastThreats,
    getRaionThreats,
    getKyivRaionStartedAt,
    getKyivRaionAlertLevel,
    getKyivRaionHasBothLevels,
    getKyivRaionThreats,
} from './alertedRegionsStore.js';
import { alertPopupHtml } from './alertPopup.js';
import { RAION_OBLAST } from './raionOblastMap.js';
import { RAION_MIN_ZOOM } from './zoomTiers.js';
import { oblastDisplayName, raionDisplayName } from './regionNameUtils.js';

const RESHADE_MS = 60000;
const TIER_MS = 30 * 60 * 1000;

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

const DUAL_LEVEL_PATTERN_ID = 'kyiv-dual-level-hatch';

function ensureDualLevelPattern(map) {
    const svg = map.getPane('overlayPane').querySelector('svg');
    if (!svg || svg.querySelector(`#${DUAL_LEVEL_PATTERN_ID}`)) return;

    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }

    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', DUAL_LEVEL_PATTERN_ID);
    pattern.setAttribute('width', '14');
    pattern.setAttribute('height', '14');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('patternTransform', 'rotate(45)');

    const redRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    redRect.setAttribute('width', '7');
    redRect.setAttribute('height', '14');
    redRect.setAttribute('fill', RED_SHADES[2]);
    pattern.appendChild(redRect);

    const yellowRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    yellowRect.setAttribute('x', '7');
    yellowRect.setAttribute('width', '7');
    yellowRect.setAttribute('height', '14');
    yellowRect.setAttribute('fill', YELLOW_SHADES[2]);
    pattern.appendChild(yellowRect);

    defs.appendChild(pattern);
}

const RegionStatusLayer = L.LayerGroup.extend({
    initialize: function (strings, language) {
        L.LayerGroup.prototype.initialize.call(this);
        this._strings = strings;
        this._language = language;
        this._kyivModeActive = false;
    },

    setKyivMode: function (active) {
        this._kyivModeActive = active;
        this._render();
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

        L.LayerGroup.prototype.onRemove.call(this, map);
    },

    _drawRegion: function (
        rings,
        displayName,
        ownStartedAt,
        now,
        popupStartedAt,
        popupAlertTypeName,
        inheritedFromName,
        alertLevel,
        hasBothLevels,
        forceBorder,
        popupThreatLines
    ) {
        const alerted = Boolean(ownStartedAt);
        const color = alerted ? shadeFor(ownStartedAt, now, alertLevel) : NEUTRAL_COLOR;
        const fillColor = alerted && hasBothLevels ? `url(#${DUAL_LEVEL_PATTERN_ID})` : color;
        const { _strings: strings, _language: language } = this;

        L.polygon(rings, {
            className: 'alert-status-shape',
            color,
            weight: alerted || forceBorder ? 1 : 0,
            opacity: alerted ? 0.5 : forceBorder ? 0.35 : 0,
            fillColor,
            fillOpacity: alerted ? ALERTED_FILL_OPACITY : NEUTRAL_FILL_OPACITY,
        })
            .bindPopup(() =>
                alertPopupHtml(
                    displayName,
                    popupStartedAt,
                    popupAlertTypeName,
                    strings,
                    language,
                    inheritedFromName,
                    alertLevel,
                    popupThreatLines
                )
            )
            .addTo(this);
    },

    _drawKyivRaions: function (isEnglish, now) {
        const cityStartedAt = getOblastStartedAt('Київ');
        const cityAlertTypeName = getOblastAlertTypeName('Київ');
        const cityAlertLevel = getOblastAlertLevel('Київ');
        const cityDisplayName = oblastDisplayName('Київ', isEnglish);

        Object.entries(KYIV_RAION_BORDERS).forEach(([name, ring]) => {
            const ownStartedAt = getKyivRaionStartedAt(name);
            const displayName = isEnglish ? `${name} District` : `${name} район`;

            if (!ownStartedAt) {
                this._drawRegion(
                    [ring],
                    displayName,
                    cityStartedAt,
                    now,
                    cityStartedAt,
                    cityAlertTypeName,
                    cityStartedAt ? cityDisplayName : null,
                    cityAlertLevel,
                    false,
                    true
                );
                return;
            }

            const ownAlertLevel = getKyivRaionAlertLevel(name);
            const hasBothLevels = getKyivRaionHasBothLevels(name);
            const threats = getKyivRaionThreats(name);
            this._drawRegion(
                [ring],
                displayName,
                ownStartedAt,
                now,
                ownStartedAt,
                null,
                null,
                ownAlertLevel,
                hasBothLevels,
                true,
                threats
            );
        });
    },

    _render: function () {
        this.clearLayers();
        if (this._map) ensureDualLevelPattern(this._map);
        const now = Date.now();
        const isEnglish = this._language === 'English';

        if (this._kyivModeActive) {
            this._drawKyivRaions(isEnglish, now);
            return;
        }

        const raionTier = this._map.getZoom() >= RAION_MIN_ZOOM;

        Object.entries(OBLAST_BORDERS).forEach(([name, rings]) => {
            const startedAt = getOblastStartedAt(name);
            const alertTypeName = getOblastAlertTypeName(name);
            const alertLevel = getOblastAlertLevel(name);
            const hasBothLevels = getOblastHasBothLevels(name);
            const threats = hasBothLevels ? getOblastThreats(name) : null;
            this._drawRegion(
                rings,
                oblastDisplayName(name, isEnglish),
                startedAt,
                now,
                startedAt,
                alertTypeName,
                null,
                alertLevel,
                hasBothLevels,
                false,
                threats
            );
        });

        if (CITY_BORDERS['Київ']) {
            const startedAt = getOblastStartedAt('Київ');
            const alertTypeName = getOblastAlertTypeName('Київ');
            const alertLevel = getOblastAlertLevel('Київ');
            const hasBothLevels = getOblastHasBothLevels('Київ');
            const threats = hasBothLevels ? getOblastThreats('Київ') : null;
            this._drawRegion(
                [CITY_BORDERS['Київ']],
                oblastDisplayName('Київ', isEnglish),
                startedAt,
                now,
                startedAt,
                alertTypeName,
                null,
                alertLevel,
                hasBothLevels,
                false,
                threats
            );
        }

        Object.entries(RAION_BORDERS).forEach(([name, ring]) => {
            const ownStartedAt = getRaionStartedAt(name);
            const ownAlertTypeName = getRaionAlertTypeName(name);
            const ownAlertLevel = getRaionAlertLevel(name);
            const ownHasBothLevels = getRaionHasBothLevels(name);
            const oblastKey = RAION_OBLAST[name];
            const oblastStartedAt = oblastKey ? getOblastStartedAt(oblastKey) : null;
            const oblastAlertTypeName = oblastKey ? getOblastAlertTypeName(oblastKey) : null;
            const oblastAlertLevel = oblastKey ? getOblastAlertLevel(oblastKey) : null;
            const oblastHasBothLevels = oblastKey ? getOblastHasBothLevels(oblastKey) : false;

            if (!raionTier) {
                if (ownStartedAt) {

                    if (!oblastStartedAt) {
                        this._drawRegion(
                            [ring],
                            raionDisplayName(name, isEnglish),
                            ownStartedAt,
                            now,
                            ownStartedAt,
                            ownAlertTypeName,
                            null,
                            ownAlertLevel,
                            ownHasBothLevels,
                            false,
                            ownHasBothLevels ? getRaionThreats(name) : null
                        );
                    }
                }
                return;
            }

            const inherited = !ownStartedAt;
            const inheritedStartedAt = inherited ? oblastStartedAt : null;
            const hasBothLevels = inherited ? oblastHasBothLevels : ownHasBothLevels;
            const threats = hasBothLevels ? (inherited ? getOblastThreats(oblastKey) : getRaionThreats(name)) : null;
            this._drawRegion(
                [ring],
                raionDisplayName(name, isEnglish),
                ownStartedAt || inheritedStartedAt,
                now,
                ownStartedAt || inheritedStartedAt,
                inherited ? oblastAlertTypeName : ownAlertTypeName,
                inherited && inheritedStartedAt ? oblastDisplayName(oblastKey, isEnglish) : null,
                inherited ? oblastAlertLevel : ownAlertLevel,
                hasBothLevels,
                false,
                threats
            );
        });
    },
});

function addRegionStatusLayer(map, strings, language) {
    return new RegionStatusLayer(strings, language).addTo(map);
}

export { addRegionStatusLayer, shadeFor };

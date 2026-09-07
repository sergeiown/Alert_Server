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
    getKyivRaionHasBothLevels,
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

// Currently only Kyiv's own per-district breakdown can have this (a drone threat that a missile
// threat later joins, both still active for the same district at once) - collapsing straight to
// the worst level would silently drop the fact that a lesser one is ALSO still live there. Same
// injected-SVG-<pattern> technique occupiedTerritory.js already uses for its own hatching, just
// with two colors (a mid-tier shade from each ladder, not the elapsed-time gradient - the point of
// this fill is "both levels are active", not how long either one has been).
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

    // While the live map's Kyiv toggle is on, this draws ONLY Kyiv's own 10 districts - not the
    // rest of the country's oblast/raion fills, which would otherwise bleed into view around
    // Kyiv's edges (Kyivska oblast's own raions border it directly).
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
        // Overriding onRemove replaces L.LayerGroup's own version entirely rather than extending
        // it - this call is required or the base class's own "remove every child shape" behavior
        // never runs.
        L.LayerGroup.prototype.onRemove.call(this, map);
    },

    // `ownStartedAt` drives what's actually drawn; `popupStartedAt`/`popupAlertTypeName`/
    // `inheritedFromName` drive the popup text, which can differ (an inherited alert is shown in
    // the popup even when nothing is drawn to indicate it visually). `hasBothLevels` (Kyiv
    // districts only, for now) swaps the fill for the red/yellow diagonal hatch instead of a solid
    // shade - the border still uses the worst level's own color, so it still reads as "this is at
    // least as bad as red" at a glance even where the hatch itself is hard to make out.
    _drawRegion: function (rings, displayName, ownStartedAt, now, popupStartedAt, popupAlertTypeName, inheritedFromName, alertLevel, hasBothLevels) {
        const alerted = Boolean(ownStartedAt);
        const color = alerted ? shadeFor(ownStartedAt, now, alertLevel) : NEUTRAL_COLOR;
        const fillColor = alerted && hasBothLevels ? `url(#${DUAL_LEVEL_PATTERN_ID})` : color;
        const { _strings: strings, _language: language } = this;

        L.polygon(rings, {
            className: 'alert-status-shape',
            color,
            weight: alerted ? 1 : 0,
            opacity: alerted ? 0.5 : 0,
            fillColor,
            fillOpacity: alerted ? ALERTED_FILL_OPACITY : NEUTRAL_FILL_OPACITY,
        })
            .bindPopup(() =>
                alertPopupHtml(displayName, popupStartedAt, popupAlertTypeName, strings, language, inheritedFromName, alertLevel)
            )
            .addTo(this);
    },

    // Deliberately does NOT fall back to the whole city's own status for a district with none of
    // its own - unlike an ordinary raion inheriting its oblast's (a coarse, whole-oblast alert
    // plausibly does cover every raion in it), Kyiv's OWN per-district status is already about as
    // granular as the data gets (parsed from the city alert's own threat text - see
    // regionAlertStatus.js's computeKyivRaionStatuses), so a district the parse didn't confirm is
    // left genuinely neutral rather than painted with the city's blanket color, which would read as
    // confirming something about that specific district that isn't actually known.
    _drawKyivRaions: function (isEnglish, now) {
        Object.entries(KYIV_RAION_BORDERS).forEach(([name, ring]) => {
            const ownStartedAt = getKyivRaionStartedAt(name);
            const ownAlertLevel = getKyivRaionAlertLevel(name);
            const hasBothLevels = getKyivRaionHasBothLevels(name);

            this._drawRegion(
                [ring],
                isEnglish ? `${name} District` : `${name} район`,
                ownStartedAt,
                now,
                ownStartedAt,
                null,
                null,
                ownAlertLevel,
                hasBothLevels
            );
        });
    },

    _render: function () {
        this.clearLayers();
        // Re-checked (cheap, idempotent - see its own guard) on every render rather than once in
        // onAdd - toggling Kyiv mode removes/re-adds several OTHER vector layers (occupied
        // territory, rivers), and if that ever causes Leaflet's shared SVG renderer to tear down
        // and recreate its root, a pattern only ever created once at startup would be gone from the
        // (new) document with nothing to notice or recreate it.
        ensureDualLevelPattern(this._map);
        const now = Date.now();
        const isEnglish = this._language === 'English';

        // Nothing outside Kyiv itself - no oblast fills, no other raions, no Kyiv-city blob - so
        // nothing from the rest of the country bleeds into view around its edges.
        if (this._kyivModeActive) {
            this._drawKyivRaions(isEnglish, now);
            return;
        }

        const raionTier = this._map.getZoom() >= RAION_MIN_ZOOM;

        Object.entries(OBLAST_BORDERS).forEach(([name, rings]) => {
            const startedAt = getOblastStartedAt(name);
            const alertTypeName = getOblastAlertTypeName(name);
            const alertLevel = getOblastAlertLevel(name);
            this._drawRegion(rings, oblastDisplayName(name, isEnglish), startedAt, now, startedAt, alertTypeName, null, alertLevel);
        });
        // Kyiv city has no oblast-tier polygon of its own (folded into Kyiv oblast's shape in the
        // source dataset), so its city outline stands in for it here - always as one shape in the
        // normal view, regardless of zoom. Its own 10 districts (see _drawKyivRaions) are a
        // different, DEDICATED view of their own, only shown via the live map's Kyiv toggle - not
        // just from zooming in far enough here, since there's nothing to key a per-district status
        // off other than parsing free text, and the "district" resolution isn't meant to be this
        // view's normal behavior for every other tracked city.
        if (CITY_BORDERS['Київ']) {
            const startedAt = getOblastStartedAt('Київ');
            const alertTypeName = getOblastAlertTypeName('Київ');
            const alertLevel = getOblastAlertLevel('Київ');
            this._drawRegion([CITY_BORDERS['Київ']], oblastDisplayName('Київ', isEnglish), startedAt, now, startedAt, alertTypeName, null, alertLevel);
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

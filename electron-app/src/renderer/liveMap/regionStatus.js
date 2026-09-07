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
// the worst level would silently drop the fact that a lesser one is ALSO still live there. A
// striped hatch (tried first, via an injected SVG <pattern> - the same technique
// occupiedTerritory.js already uses for its own hatching) read as fussy texture rather than a
// clean answer to "which half is which" - this instead genuinely cuts the district's own polygon
// in two along a fixed diagonal through its centroid (Sutherland-Hodgman single-edge clip - no
// SVG defs/patterns involved at all, so there's nothing shared to go stale if other layers come
// and go), each half then drawn as its own plain, solid-color polygon.
function ringCentroid(ring) {
    const points = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : [...ring, ring[0]];
    let area = 0;
    let cLat = 0;
    let cLng = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const [lat0, lng0] = points[i];
        const [lat1, lng1] = points[i + 1];
        const cross = lng0 * lat1 - lng1 * lat0;
        area += cross;
        cLng += (lng0 + lng1) * cross;
        cLat += (lat0 + lat1) * cross;
    }
    area /= 2;
    if (Math.abs(area) < 1e-9) {
        const [latSum, lngSum] = ring.reduce(([lat, lng], [pointLat, pointLng]) => [lat + pointLat, lng + pointLng], [0, 0]);
        return [latSum / ring.length, lngSum / ring.length];
    }
    return [cLat / (6 * area), cLng / (6 * area)];
}

// Signed distance (up to a constant factor) of a point from the line through `centroid` running in
// direction (dirLat, dirLng) - sign alone is what matters, to sort each vertex onto one side or
// the other of that line.
function sideOf(point, centroid, dirLat, dirLng) {
    return (point[0] - centroid[0]) * dirLng - (point[1] - centroid[1]) * dirLat;
}

function lineIntersection(p1, p2, centroid, dirLat, dirLng) {
    const s1 = sideOf(p1, centroid, dirLat, dirLng);
    const s2 = sideOf(p2, centroid, dirLat, dirLng);
    const t = s1 / (s1 - s2);
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

// Sutherland-Hodgman clip of one ring against one half-plane (the line through the polygon's own
// centroid, along a fixed NE-SW diagonal) - `keepPositive` picks which side survives.
function clipHalf(ring, centroid, dirLat, dirLng, keepPositive) {
    const output = [];
    const n = ring.length;

    for (let i = 0; i < n; i++) {
        const curr = ring[i];
        const prev = ring[(i - 1 + n) % n];
        const currSide = sideOf(curr, centroid, dirLat, dirLng);
        const prevSide = sideOf(prev, centroid, dirLat, dirLng);
        const currInside = keepPositive ? currSide >= 0 : currSide <= 0;
        const prevInside = keepPositive ? prevSide >= 0 : prevSide <= 0;

        if (currInside !== prevInside) output.push(lineIntersection(prev, curr, centroid, dirLat, dirLng));
        if (currInside) output.push(curr);
    }

    return output;
}

// A fixed 45° diagonal for every district - simpler and more predictable than trying to orient the
// split to each shape's own long axis, and reads fine regardless of a given district's proportions.
const SPLIT_DIR_LAT = 1;
const SPLIT_DIR_LNG = 1;

function splitRingInHalf(ring) {
    const centroid = ringCentroid(ring);
    return [clipHalf(ring, centroid, SPLIT_DIR_LAT, SPLIT_DIR_LNG, true), clipHalf(ring, centroid, SPLIT_DIR_LAT, SPLIT_DIR_LNG, false)];
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
    // the popup even when nothing is drawn to indicate it visually). `borderLevel` (defaults to
    // `alertLevel`) lets a half-district draw (see _drawKyivRaions) use its OWN half's color for the
    // border too, instead of always outlining in the worst level's color regardless of which half
    // is which. `forceBorder` (Kyiv districts only) keeps the outline visible even with no active
    // alert at all - real imagery underneath means the district shape itself needs its own outline
    // to read as a district, unlike the plain abstract background elsewhere, where an unalerted
    // region is already legible from the underlying map art alone.
    _drawRegion: function (rings, displayName, ownStartedAt, now, popupStartedAt, popupAlertTypeName, inheritedFromName, alertLevel, borderLevel, forceBorder) {
        const alerted = Boolean(ownStartedAt);
        const color = alerted ? shadeFor(ownStartedAt, now, borderLevel || alertLevel) : NEUTRAL_COLOR;
        const { _strings: strings, _language: language } = this;

        L.polygon(rings, {
            className: 'alert-status-shape',
            color,
            weight: alerted || forceBorder ? 1 : 0,
            opacity: alerted ? 0.5 : forceBorder ? 0.35 : 0,
            fillColor: color,
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
            const displayName = isEnglish ? `${name} District` : `${name} район`;

            if (hasBothLevels) {
                // A real cut of the district's own shape into two halves (see splitRingInHalf) -
                // red half shaded on the red ladder, yellow half on the yellow ladder, both from the
                // SAME startedAt (there's only one per district, not one per level).
                const [halfA, halfB] = splitRingInHalf(ring);
                this._drawRegion([halfA], displayName, ownStartedAt, now, ownStartedAt, null, null, 'red', 'red', true);
                this._drawRegion([halfB], displayName, ownStartedAt, now, ownStartedAt, null, null, 'yellow', 'yellow', true);
                return;
            }

            this._drawRegion([ring], displayName, ownStartedAt, now, ownStartedAt, null, null, ownAlertLevel, null, true);
        });
    },

    _render: function () {
        this.clearLayers();
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

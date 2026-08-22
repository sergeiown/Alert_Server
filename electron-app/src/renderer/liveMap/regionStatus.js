import { OBLAST_BORDERS } from './oblastBorders.js';
import { RAION_BORDERS } from './raionBorders.js';
import { CITY_BORDERS } from './cityBorders.js';
import { subscribe as subscribeAlertedRegions, getOblastStartedAt, getRaionStartedAt } from './alertedRegionsStore.js';
import { alertPopupHtml } from './alertPopup.js';
import { RAION_OBLAST } from './raionOblastMap.js';
import { RAION_MIN_ZOOM } from './zoomTiers.js';

const RESHADE_MS = 60000; // recompute shades between fetches too, since they depend on elapsed time
const TIER_MS = 30 * 60 * 1000;

// Progressively darker red the longer a region has been under alert (one step per 30 minutes),
// capped at a still-subdued tone - the whole scale stays light, a barely-there tint rather than a
// loud warning color, so it doesn't compete for attention with the threat markers.
const SHADES = ['#fbeceb', '#f7dbd9', '#f0c1bd', '#e8a8a2', '#dd8c85', '#d1716a'];
const ALERTED_FILL_OPACITY = 0.18;

// Regions with no active alert right now still get drawn - just about invisible - so the whole
// oblast/raion is clickable everywhere, not only where something is currently lit up.
const NEUTRAL_FILL_OPACITY = 0.02;
const NEUTRAL_COLOR = '#d1716a';

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
    },

    // `ownStartedAt` drives what's actually drawn. `popupStartedAt`/`inheritedFromName` drive the
    // popup, which should say so even when nothing is drawn to indicate it visually.
    _drawRegion: function (rings, displayName, ownStartedAt, now, popupStartedAt, inheritedFromName) {
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
            .bindPopup(() => alertPopupHtml(displayName, popupStartedAt, strings, language, inheritedFromName))
            .addTo(this);
    },

    _render: function () {
        this.clearLayers();
        const now = Date.now();
        // Zoomed out to oblast level: a raion lighting up on its own (no oblast-wide alert
        // behind it) still needs to show, or it would be invisible at this zoom - but a raion
        // inside an already-alerted oblast is skipped here, since the oblast's own fill already
        // covers that ground and drawing the raion too would just double up on the same info.
        // Zoomed in to raion level: every raion shows its own status, inherited from the oblast
        // when it has none of its own - that's the level of detail the user zoomed in for.
        const raionTier = this._map.getZoom() >= RAION_MIN_ZOOM;

        Object.entries(OBLAST_BORDERS).forEach(([name, rings]) => {
            const startedAt = getOblastStartedAt(name);
            this._drawRegion(rings, name, startedAt, now, startedAt);
        });
        // Kyiv city ("м. Київ") has no oblast-tier polygon of its own - it's folded into Kyiv
        // oblast's shape in that source dataset - so its real city outline stands in for it here.
        if (CITY_BORDERS['Київ']) {
            const startedAt = getOblastStartedAt('м. Київ');
            this._drawRegion([CITY_BORDERS['Київ']], 'Київ', startedAt, now, startedAt);
        }

        Object.entries(RAION_BORDERS).forEach(([name, ring]) => {
            const ownStartedAt = getRaionStartedAt(name);
            const oblastKey = RAION_OBLAST[name];
            const oblastStartedAt = oblastKey ? getOblastStartedAt(oblastKey) : null;

            if (!raionTier) {
                if (ownStartedAt) {
                    // Its own alert, no oblast-wide one behind it - the only raion-level case
                    // that must show while zoomed out.
                    if (!oblastStartedAt) this._drawRegion([ring], name, ownStartedAt, now, ownStartedAt);
                }
                return;
            }

            const inheritedStartedAt = !ownStartedAt ? oblastStartedAt : null;
            this._drawRegion(
                [ring],
                name,
                ownStartedAt || inheritedStartedAt,
                now,
                ownStartedAt || inheritedStartedAt,
                inheritedStartedAt ? oblastKey : null
            );
        });
    },
});

function addRegionStatusLayer(map, strings, language) {
    return new RegionStatusLayer(strings, language).addTo(map);
}

export { addRegionStatusLayer };

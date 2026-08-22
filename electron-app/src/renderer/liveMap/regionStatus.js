import { OBLAST_BORDERS } from './oblastBorders.js';
import { RAION_BORDERS } from './raionBorders.js';
import { CITY_BORDERS } from './cityBorders.js';
import { subscribe as subscribeAlertedRegions, getOblastStartedAt, getRaionStartedAt } from './alertedRegionsStore.js';
import { alertPopupHtml } from './alertPopup.js';
import { RAION_OBLAST } from './raionOblastMap.js';

const RESHADE_MS = 60000; // recompute shades between fetches too, since they depend on elapsed time
const TIER_MS = 15 * 60 * 1000;

// Progressively darker red the longer a region has been under alert (one step per 15 minutes),
// capped at a light, clearly-still-red tone - not a dark bruise-colored one.
const SHADES = ['#fbd6d4', '#f6b5b1', '#ef928c', '#e5716a', '#d8544b', '#c93a30'];
const ALERTED_FILL_OPACITY = 0.35;

// Regions with no active alert right now still get drawn - just about invisible - so the whole
// oblast/raion is clickable everywhere, not only where something is currently lit up.
const NEUTRAL_FILL_OPACITY = 0.02;

function shadeFor(startedAt, now) {
    const elapsed = now - new Date(startedAt).getTime();
    const tier = Math.min(SHADES.length - 1, Math.max(0, Math.floor(elapsed / TIER_MS)));
    return SHADES[tier];
}

function addRegionStatusLayer(map, strings, language) {
    const layer = L.layerGroup();

    // `ownStartedAt` drives what's actually drawn (a raion that only inherits its oblast's alert
    // stays visually near-invisible - the oblast's own shape underneath already shows the color
    // for that whole area, drawing the same tint twice over just double-darkens that one raion).
    // `popupStartedAt`/`inheritedFromName` drive the popup, which should say so either way.
    function drawRegion(rings, displayName, ownStartedAt, now, popupStartedAt, inheritedFromName) {
        const alerted = Boolean(ownStartedAt);
        const color = alerted ? shadeFor(ownStartedAt, now) : '#c93a30';

        L.polygon(rings, {
            className: 'alert-status-shape',
            color,
            weight: alerted ? 1.5 : 0,
            opacity: alerted ? 0.8 : 0,
            fillColor: color,
            fillOpacity: alerted ? ALERTED_FILL_OPACITY : NEUTRAL_FILL_OPACITY,
        })
            .bindPopup(() => alertPopupHtml(displayName, popupStartedAt, strings, language, inheritedFromName))
            .addTo(layer);
    }

    function render() {
        layer.clearLayers();
        const now = Date.now();

        Object.entries(OBLAST_BORDERS).forEach(([name, rings]) => {
            const startedAt = getOblastStartedAt(name);
            drawRegion(rings, name, startedAt, now, startedAt);
        });
        // Kyiv city ("м. Київ") has no oblast-tier polygon of its own - it's folded into Kyiv
        // oblast's shape in that source dataset - so its real city outline stands in for it here.
        if (CITY_BORDERS['Київ']) {
            const startedAt = getOblastStartedAt('м. Київ');
            drawRegion([CITY_BORDERS['Київ']], 'Київ', startedAt, now, startedAt);
        }

        Object.entries(RAION_BORDERS).forEach(([name, ring]) => {
            const ownStartedAt = getRaionStartedAt(name);
            // A raion with no alert of its own, sitting inside an oblast that IS under a
            // whole-oblast alert, should still say so when clicked - not just "no active alert" -
            // the raion's own (still just-about-invisible) shape is what actually receives the
            // click, since it's drawn on top of the oblast's.
            const oblastKey = RAION_OBLAST[name];
            const inheritedStartedAt = !ownStartedAt && oblastKey ? getOblastStartedAt(oblastKey) : null;
            drawRegion(
                [ring],
                name,
                ownStartedAt,
                now,
                ownStartedAt || inheritedStartedAt,
                inheritedStartedAt ? oblastKey : null
            );
        });
    }

    subscribeAlertedRegions(render);
    setInterval(render, RESHADE_MS);

    return layer.addTo(map);
}

export { addRegionStatusLayer };

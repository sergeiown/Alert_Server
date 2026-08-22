import { OBLAST_BORDERS } from './oblastBorders.js';
import { RAION_BORDERS } from './raionBorders.js';
import { CITY_BORDERS } from './cityBorders.js';

const REFRESH_MS = 30000; // matches the main process poll cadence
const RESHADE_MS = 60000; // recompute shades between fetches too, since they depend on elapsed time
const TIER_MS = 15 * 60 * 1000;

// Progressively darker red the longer a region has been under alert (one step per 15 minutes),
// capped at the last shade instead of drifting toward black forever.
const SHADES = ['#f4a3a0', '#ea7b76', '#dc5852', '#c73a34', '#a52822', '#8a1e19', '#6b1512'];

function shadeFor(startedAt, now) {
    const elapsed = now - new Date(startedAt).getTime();
    const tier = Math.min(SHADES.length - 1, Math.max(0, Math.floor(elapsed / TIER_MS)));
    return SHADES[tier];
}

function normalizeOblastName(name) {
    return name.replace(/\s*область\s*$/u, '').trim();
}

function normalizeRaionName(name) {
    return name
        .replace(/\s*район\s*$/u, '')
        .replace(/[’ʼ]/g, "'")
        .trim();
}

function drawRings(layer, rings, color) {
    L.polygon(rings, {
        className: 'alert-status-shape',
        color,
        weight: 1.5,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: 0.45,
        interactive: false,
    }).addTo(layer);
}

function addRegionStatusLayer(map) {
    const layer = L.layerGroup();
    let latest = { oblasts: [], raions: [] };

    function render() {
        layer.clearLayers();
        const now = Date.now();

        latest.oblasts.forEach(({ name, startedAt }) => {
            const key = normalizeOblastName(name);
            const color = shadeFor(startedAt, now);
            const rings = OBLAST_BORDERS[key];
            if (rings) {
                drawRings(layer, rings, color);
            } else if (CITY_BORDERS[key]) {
                // Kyiv city ("м. Київ") has no oblast-tier polygon of its own - it's folded into
                // Kyiv oblast's shape in that dataset - so its real city outline stands in for it.
                drawRings(layer, [CITY_BORDERS[key]], color);
            }
        });

        latest.raions.forEach(({ name, startedAt }) => {
            const key = normalizeRaionName(name);
            const ring = RAION_BORDERS[key];
            if (!ring) return;
            drawRings(layer, [ring], shadeFor(startedAt, now));
        });
    }

    async function refresh() {
        latest = await window.alertServerLiveMap.getAlertedRegions();
        render();
    }

    refresh();
    setInterval(refresh, REFRESH_MS);
    setInterval(render, RESHADE_MS);

    return layer.addTo(map);
}

export { addRegionStatusLayer };

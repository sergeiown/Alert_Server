// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { normalizeOblastName, oblastDisplayName } from './regionNameUtils.js';
import { transliterate } from './transliterate.js';

const THREATS_URL = 'https://neptun.in.ua/api/v1/threats';
const STREAM_URL = 'wss://neptun.in.ua/api/v1/stream';
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 30000;
// The WebSocket stream is the primary live feed; this is just a safety-net re-fetch in case a
// stream update is ever missed, so the map can't drift stale for long without hammering the API.
const SNAPSHOT_REFRESH_MS = 60000;

const TOOLTIP_MAX_WIDTH_PX = 410;
const TOOLTIP_MIN_WIDTH_PX = 90;
const TOOLTIP_WIDTH_PADDING_PX = 14;

const MISSILE_TYPE_ALIASES = ['missile', 'rocket', 'cruise_missile', 'ballistic'];
const RECON_TITLE_PATTERN = /розвід/i;

// A dedicated pane so threat icons always render above every other map layer (region shading,
// labels, occupied-territory hatching), regardless of which order those layers happen to redraw
// in - relying on DOM insertion order across layers that redraw at different times is what let
// icons intermittently end up hidden behind a same-pane layer that just happened to redraw after
// them. Sits above the default markerPane (600) but below tooltipPane (650), so a hovered
// threat's own tooltip still shows above its icon as usual.
const THREATS_PANE = 'threatsPane';
const THREATS_PANE_Z = 620;
// The uncertainty-radius circles get their own lower pane so they stay a background ring under
// every icon and label, never on top of one, while still sitting above the region-status shading
// (overlayPane, 400).
const UNCERTAINTY_PANE = 'threatsUncertaintyPane';
const UNCERTAINTY_PANE_Z = 410;
const UNCERTAINTY_CIRCLE_COLOR = '#6b7280';
const UNCERTAIN_ICON_COLOR = '#9ca3af';

// Minimum on-screen center-to-center spacing kept between threat icons - comfortably more than
// the 22px icon itself, so nudged-apart icons never end up touching, let alone one covering
// another.
const MARKER_MIN_GAP_PX = 28;
const DECLUTTER_ITERATIONS = 40;

// Nudges icons apart in screen-pixel space only (never changes which real-world spot a marker is
// tooltip-anchored near by more than a fraction of the map view) - pure relaxation: as long as any
// pair is closer than the minimum gap, push both away from each other by half the shortfall.
// Two threats reported at the exact same point start at zero distance, which has no direction to
// push along - resolved with a deterministic per-pair angle so they don't stay stacked.
function declutterPoints(points, minGap) {
    const out = points.map((p) => ({ x: p.x, y: p.y }));

    for (let iter = 0; iter < DECLUTTER_ITERATIONS; iter++) {
        let moved = false;

        for (let i = 0; i < out.length; i++) {
            for (let j = i + 1; j < out.length; j++) {
                let dx = out[j].x - out[i].x;
                let dy = out[j].y - out[i].y;
                let dist = Math.hypot(dx, dy);

                if (dist < 1e-6) {
                    const angle = ((i * 47 + j * 91) % 360) * (Math.PI / 180);
                    dx = Math.cos(angle);
                    dy = Math.sin(angle);
                    dist = 1;
                }

                if (dist < minGap) {
                    const overlap = (minGap - dist) / 2;
                    const ux = dx / dist;
                    const uy = dy / dist;
                    out[i].x -= ux * overlap;
                    out[i].y -= uy * overlap;
                    out[j].x += ux * overlap;
                    out[j].y += uy * overlap;
                    moved = true;
                }
            }
        }

        if (!moved) break;
    }

    return out;
}

// Nose/front points up = 0 deg = north, so rotating the wrapper by `heading` degrees points the
// icon the right way.
// Each shape below was hand-drawn against its own part of the 24x24 canvas, with no shared
// convention for how big or how centered the result would end up - "uav"'s own ink center sits
// at (12,9), not (12,12), and its bounding box is barely 2/3 the size of "mig31k"'s. Centering the
// 22x22 *container* (which every icon already gets) does nothing about either problem: two icons
// can sit in identically-centered boxes and still look different heights and different sizes.
// Each entry's `align` transform (computed once, from each shape's real bounding box - see the
// bbox script referenced in the neptun.js commit that added this) recenters that icon's own ink
// on (12,12) and rescales it so its longest side is ~20 units, before the shared wrapper ever
// gets to it - only after that does every icon share one actual, not just nominal, size and center.
const TYPE_ICONS = {
    uav: {
        color: '#f5a623',
        align: 'translate(12,12) scale(1.25) translate(-12,-9)',
        svg:
            '<polygon points="12,1 19,17 12,13.5 5,17" />' +
            '<line x1="12" y1="2" x2="12" y2="13.5" stroke="#ffffff" stroke-width="0.8" opacity="0.6" />',
    },
    uav_recon: {
        color: '#5b8fb0',
        align: 'translate(12,12) scale(0.889) translate(-12,-12.25)',
        svg:
            '<path d="M12 1 L13 12 L22 12 L22 13.5 L13 13.5 L13.5 20.5 L16.5 22.5 L16.5 23.5 L12 22.3 ' +
            'L7.5 23.5 L7.5 22.5 L10.5 20.5 L11 13.5 L2 13.5 L2 12 L11 12 Z" />',
    },
    fpv: {
        color: '#ff6b35',
        align: 'translate(12,12) scale(1.087) translate(-12,-11.2)',
        // The plain quad-rotor frame is symmetric under a 90-degree turn (a `heading` rotation
        // would look identical at four different headings) - the nose triangle breaks that
        // symmetry so the rotation actually reads as a direction.
        svg:
            '<line x1="12" y1="12" x2="7" y2="7" stroke="currentColor" stroke-width="2.4" />' +
            '<line x1="12" y1="12" x2="17" y2="7" stroke="currentColor" stroke-width="2.4" />' +
            '<line x1="12" y1="12" x2="7" y2="17" stroke="currentColor" stroke-width="2.4" />' +
            '<line x1="12" y1="12" x2="17" y2="17" stroke="currentColor" stroke-width="2.4" />' +
            '<circle cx="7" cy="7" r="3.4" /><circle cx="17" cy="7" r="3.4" />' +
            '<circle cx="7" cy="17" r="3.4" /><circle cx="17" cy="17" r="3.4" />' +
            '<circle cx="12" cy="12" r="2.6" />' +
            '<polygon points="12,2 14.2,7 9.8,7" />',
    },
    kab: {
        color: '#dc2626',
        align: 'translate(12,12) scale(0.93) translate(-12,-11.75)',
        svg: '<ellipse cx="12" cy="15" rx="4.2" ry="7.5" /><polygon points="7.5,8 3,2 8.5,5.5" /><polygon points="16.5,8 21,2 15.5,5.5" /><polygon points="10.5,7 13.5,7 12,1" />',
    },
    missile: {
        color: '#991b1b',
        align: 'translate(12,12) scale(0.909) translate(-12,-12)',
        svg: '<polygon points="12,1 15,9 15,20 9,20 9,9" /><polygon points="9,15.5 4,22 9,19.5" /><polygon points="15,15.5 20,22 15,19.5" /><polygon points="10.5,17 13.5,17 12,23" />',
    },
    mig31k: {
        color: '#7c3aed',
        align: 'translate(12,12) scale(0.87) translate(-12,-12.5)',
        svg: '<path d="M12 1 L13 14 L21 21 L21 22.5 L13 18 L13.5 22.5 L16 24 L12 23 L8 24 L10.5 22.5 L11 18 L3 22.5 L3 21 L11 14 Z" />',
    },
    unknown: {
        color: '#6b7280',
        align: 'translate(12,12) scale(1.111) translate(-12,-11)',
        svg:
            '<path d="M12 3 L21 19 H3 Z" />' +
            '<line x1="12" y1="9" x2="12" y2="14" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />' +
            '<circle cx="12" cy="16.5" r="1" fill="#fff" />',
    },
};

function resolveTypeKey(threat) {
    // The real API sends reconnaissance drones as type "recon", not "uav" - not a key in
    // TYPE_ICONS, so without this check they fell through to "unknown" every time.
    if (threat.type === 'recon') return 'uav_recon';
    if (threat.type === 'uav' && RECON_TITLE_PATTERN.test(`${threat.title} ${threat.explanationShort}`)) {
        return 'uav_recon';
    }
    if (TYPE_ICONS[threat.type]) return threat.type;
    if (MISSILE_TYPE_ALIASES.includes(threat.type)) return 'missile';
    return 'unknown';
}

function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// The heading rotation lives on an inner wrapper, not on .threat-icon itself - a CSS filter (the
// drop-shadow) is computed before its element's own transform is applied, so a shadow set on the
// same element that rotates would spin along with the icon instead of staying cast in one fixed
// direction.
// `uncertain` swaps the icon's own type color for a flat gray instead - distinct from any real
// type color (including the "unknown" type's own gray) so it never reads as "this is an unknown-
// type threat" - a quick visual cue that Neptun itself hasn't confirmed this one yet, without
// needing to open the tooltip to find out. Only lifecycle drives this, not `status` - every threat
// in the feed is "active" by definition of being in it, so that field never actually varies.
const DEFAULT_ICON_SIZE_PX = 22;
// Smaller on the map specifically for "uav" and "fpv" (confirmed and uncertain both share the same
// entry per type, only the fill color differs) - the legend keeps the normalized default size,
// since it's meant to show every type at one consistent scale for comparison, not the map's own
// per-type sizing.
const MAP_ICON_SIZE_OVERRIDES = { uav: 18, fpv: 18 };

function iconHtml(typeKey, rotationDeg, lifecycle, sizePx = DEFAULT_ICON_SIZE_PX) {
    const { color, svg, align } = TYPE_ICONS[typeKey];
    const rotation = typeof rotationDeg === 'number' ? `transform: rotate(${rotationDeg}deg);` : '';
    const fillColor = lifecycle === 'uncertain' ? UNCERTAIN_ICON_COLOR : color;
    return (
        `<div class="threat-icon" style="color: ${fillColor};">` +
        `<div class="threat-icon-rotate" style="${rotation}">` +
        `<svg viewBox="0 0 24 24" width="${sizePx}" height="${sizePx}" fill="currentColor" stroke="#ffffff" stroke-width="1">` +
        `<g transform="${align}">${svg}</g></svg>` +
        `</div></div>`
    );
}

function threatIcon(threat) {
    const typeKey = resolveTypeKey(threat);
    const rotation = typeof threat.heading === 'number' ? threat.heading : undefined;
    const sizePx = MAP_ICON_SIZE_OVERRIDES[typeKey] || DEFAULT_ICON_SIZE_PX;

    return L.divIcon({
        className: 'threat-icon-wrapper',
        html: iconHtml(typeKey, rotation, threat.lifecycle, sizePx),
        iconSize: [sizePx, sizePx],
        iconAnchor: [sizePx / 2, sizePx / 2],
    });
}

function confidenceLabel(threat, strings) {
    const key = `liveMapConfidence${(threat.displayConfidence || threat.confidenceLevel || '').replace(/^(.)/, (m) => m.toUpperCase())}`;
    return strings[key] || threat.displayConfidence || threat.confidenceLevel || '';
}

// threat.title/explanationShort/locality/region are Neptun's own free text, always in Ukrainian -
// there is no English variant of any of them. In English mode the explanation is rebuilt as a
// "locality, oblast" line instead, and the locality is transliterated (it has no real translation
// source anywhere in this app) so the line doesn't mix an English oblast with a Cyrillic locality.
// Ukrainian mode is built from the same raw fields too, rather than shown verbatim, so it doesn't
// just repeat the type name already shown in the title line above it.
function tooltipContent(threat, strings, isEnglish) {
    const typeKey = resolveTypeKey(threat);
    const locale = isEnglish ? 'en-US' : 'uk-UA';
    const updatedTime = threat.updatedAt ? new Date(threat.updatedAt).toLocaleTimeString(locale) : '';
    const title = strings[`liveMapType_${typeKey}`] || threat.title;

    const oblastPart = threat.region ? oblastDisplayName(normalizeOblastName(threat.region), true) : '';
    const localityPart = isEnglish && threat.locality ? transliterate(threat.locality) : threat.locality;
    const districtPart = isEnglish && threat.district ? transliterate(threat.district) : threat.district;
    const localityRegion = [threat.locality, threat.district, threat.region].filter(Boolean).join(', ');

    const locationLine = isEnglish
        ? [localityPart, districtPart, oblastPart].filter(Boolean).join(', ')
        : localityRegion
          ? `${strings.liveMapDirectionLabel} - ${localityRegion}.`
          : threat.explanationShort || '';
    // Its own line, not tacked onto the end of locationLine - keeping it separate is what lets the
    // location sentence itself get the tooltip's full width instead of a bit less.
    const confirmationsLine =
        !isEnglish && typeof threat.sourceCount === 'number'
            ? `${strings.liveMapConfirmations}: ${threat.sourceCount}.`
            : '';

    const lines = [
        `<strong>${escapeHtml(title)}</strong>`,
        escapeHtml(locationLine),
        escapeHtml(confirmationsLine),
        `<small>${strings.liveMapDangerLabel} ${escapeHtml(confidenceLabel(threat, strings))}${updatedTime ? ` · ${strings.liveMapUpdated}: ${updatedTime}` : ''}</small>`,
    ];
    return lines.filter(Boolean).join('<br>');
}

// Sizes a tooltip to its own content, capped at a max width - can't be done in plain CSS here (see
// the comment on .leaflet-tooltip in index.css for why). Measured via canvas rather than by
// reading the DOM element's own offsetWidth: Leaflet's tooltip pane has no definite width of its
// own for an absolutely-positioned child to shrink-to-fit against, so DOM-based measurements
// (even the temporarily-forced-nowrap trick Leaflet's own Popup uses) come back unreliably small
// here - a fresh canvas measurement of the actual text is unaffected by that.
let measureCanvas = null;
function measureTooltipWidth(el) {
    if (!measureCanvas) measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    const cs = getComputedStyle(el);
    let widest = 0;

    el.querySelectorAll('strong, small').forEach((node) => {
        ctx.font = `${node.tagName === 'STRONG' ? 'bold ' : ''}${cs.fontSize} ${cs.fontFamily}`;
        widest = Math.max(widest, ctx.measureText(node.textContent).width);
    });

    ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
    el.innerText.split('\n').forEach((line) => {
        widest = Math.max(widest, ctx.measureText(line).width);
    });

    return Math.max(TOOLTIP_MIN_WIDTH_PX, Math.min(widest + TOOLTIP_WIDTH_PADDING_PX, TOOLTIP_MAX_WIDTH_PX));
}

const ALL_TYPE_KEYS = ['uav', 'uav_recon', 'fpv', 'kab', 'missile', 'mig31k', 'unknown'];

// Standalone swatch (not a real threat icon) explaining the dashed uncertainty-radius circle -
// not a "threat type" with its own row otherwise, and looks like unexplained noise without one.
// The gray-icon convention doesn't need an equivalent generic swatch - see the uncertain rows
// built below, which reuse each type's own real icon shape instead of a fake stand-in for it.
const APPROX_SWATCH_HTML =
    `<span class="legend-swatch"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${UNCERTAINTY_CIRCLE_COLOR}" ` +
    'stroke-width="1.2" stroke-opacity="0.45" stroke-dasharray="3 2.5"><circle cx="12" cy="12" r="10"/></svg></span>';

// Only lists the threat types actually on the map right now, not the full fixed set - a legend
// entry for a type nothing currently shows is a row explaining nothing. Confirmed and uncertain
// sightings of the same type get their OWN separate rows (rather than one row per type, shown in
// whichever color happened to be picked) - otherwise a type seen only as uncertain would still
// show its confirmed-color swatch, which then matches nothing actually on the map. The "approx"
// row is just as conditional, shown only while at least one visible threat has that trait.
// update() is called on every render; the legend hides itself entirely during a fully quiet
// stretch rather than show an empty box.
function buildLegend(strings) {
    const legend = L.control({ position: 'bottomleft' });
    let container = null;

    legend.onAdd = () => {
        container = L.DomUtil.create('div', 'threat-legend');
        legend.update({ confirmedTypeKeys: [], uncertainTypeKeys: [], hasApprox: false });
        return container;
    };

    legend.update = ({ confirmedTypeKeys, uncertainTypeKeys, hasApprox }) => {
        if (!container) return;
        const confirmedKeys = ALL_TYPE_KEYS.filter((key) => confirmedTypeKeys.includes(key));
        const uncertainKeys = ALL_TYPE_KEYS.filter((key) => uncertainTypeKeys.includes(key));

        if (!confirmedKeys.length && !uncertainKeys.length && !hasApprox) {
            container.style.display = 'none';
            return;
        }

        container.style.display = '';
        const confirmedRows = confirmedKeys
            .map((typeKey) => `<div class="legend-row">${iconHtml(typeKey)}<span>${escapeHtml(strings[`liveMapType_${typeKey}`])}</span></div>`)
            .join('');
        const uncertainRows = uncertainKeys
            .map(
                (typeKey) =>
                    `<div class="legend-row">${iconHtml(typeKey, undefined, 'uncertain')}<span>${escapeHtml(strings[`liveMapType_${typeKey}`])} · ${escapeHtml(strings.liveMapLegendUncertain)}</span></div>`
            )
            .join('');
        const approxRow = hasApprox
            ? `<div class="legend-row">${APPROX_SWATCH_HTML}<span>${escapeHtml(strings.liveMapLegendApprox)}</span></div>`
            : '';
        container.innerHTML = `<div class="legend-title">${escapeHtml(strings.liveMapLegendTitle)}</div>${confirmedRows}${uncertainRows}${approxRow}`;
    };

    return legend;
}

function startNeptunLayer(map, strings, language, onCountChange) {
    if (!map.getPane(THREATS_PANE)) {
        map.createPane(THREATS_PANE).style.zIndex = THREATS_PANE_Z;
    }
    if (!map.getPane(UNCERTAINTY_PANE)) {
        map.createPane(UNCERTAINTY_PANE).style.zIndex = UNCERTAINTY_PANE_Z;
    }

    const layer = L.layerGroup().addTo(map);
    const isEnglish = language === 'English';
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let lastThreats = [];

    const legend = buildLegend(strings);
    legend.addTo(map);

    map.on('tooltipopen', (e) => {
        const el = e.tooltip.getElement();
        if (!el) return;
        el.style.width = `${measureTooltipWidth(el)}px`;
        e.tooltip.update();
    });

    function renderThreats(threats) {
        layer.clearLayers();
        if (!Array.isArray(threats)) return;
        lastThreats = threats;

        const valid = threats.filter((t) => typeof t.lat === 'number' && typeof t.lon === 'number');
        legend.update({
            confirmedTypeKeys: valid.filter((t) => t.lifecycle !== 'uncertain').map((t) => resolveTypeKey(t)),
            uncertainTypeKeys: valid.filter((t) => t.lifecycle === 'uncertain').map((t) => resolveTypeKey(t)),
            hasApprox: valid.some((t) => t.positionQuality === 'approx' && typeof t.uncertaintyKm === 'number'),
        });
        if (typeof onCountChange === 'function') onCountChange(valid.length);

        // Drawn at the threat's true coordinates, not the decluttered on-screen spread below -
        // the circle is a statement about where the real position uncertainty is, so nudging it
        // to follow a marker that only moved to avoid overlapping a neighbor would make it lie.
        // Kept faint (low opacity, thin line) - it's background context for the icon sitting on
        // top of it, not something that should compete with it for attention.
        valid
            .filter((t) => t.positionQuality === 'approx' && typeof t.uncertaintyKm === 'number')
            .forEach((threat) => {
                L.circle([threat.lat, threat.lon], {
                    pane: UNCERTAINTY_PANE,
                    radius: threat.uncertaintyKm * 1000,
                    color: UNCERTAINTY_CIRCLE_COLOR,
                    weight: 1,
                    opacity: 0.45,
                    dashArray: '4 5',
                    fill: false,
                    interactive: false,
                }).addTo(layer);
            });

        const points = valid.map((t) => map.latLngToContainerPoint([t.lat, t.lon]));
        const spread = declutterPoints(points, MARKER_MIN_GAP_PX);

        valid.forEach((threat, i) => {
            const displayLatLng = map.containerPointToLatLng([spread[i].x, spread[i].y]);
            L.marker(displayLatLng, { icon: threatIcon(threat), pane: THREATS_PANE })
                .bindTooltip(tooltipContent(threat, strings, isEnglish))
                .on('mouseover', () => map.closePopup())
                .addTo(layer);
        });
    }

    // The on-screen gap between two threats changes with zoom even though nothing about the
    // threats themselves changed - re-run the same declutter pass against the last known data
    // instead of waiting for the next snapshot/stream update.
    map.on('zoomend', () => renderThreats(lastThreats));

    async function fetchSnapshot() {
        try {
            const response = await fetch(THREATS_URL);
            if (!response.ok) return;
            const data = await response.json();
            renderThreats(data.threats);
        } catch (err) {
            console.error('Neptun snapshot fetch failed:', err.message);
        }
    }

    function resetHeartbeatWatch() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
            console.error('Neptun stream: no messages received, reconnecting');
            connect();
        }, HEARTBEAT_TIMEOUT_MS);
    }

    function connect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        let socket;
        try {
            socket = new WebSocket(STREAM_URL);
        } catch (err) {
            console.error('Neptun stream connection failed:', err.message);
            reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
            return;
        }

        socket.addEventListener('message', (event) => {
            resetHeartbeatWatch();
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'snapshot') {
                    renderThreats(message.data?.threats);
                }
            } catch (err) {
                console.error('Neptun stream message parse failed:', err.message);
            }
        });

        socket.addEventListener('open', resetHeartbeatWatch);

        socket.addEventListener('close', () => {
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
            reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        });

        socket.addEventListener('error', (event) => {
            console.error('Neptun stream error:', event.message || 'unknown error');
        });
    }

    fetchSnapshot();
    connect();
    setInterval(fetchSnapshot, SNAPSHOT_REFRESH_MS);

    return layer;
}

export { startNeptunLayer };

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
const TYPE_ICONS = {
    uav: {
        color: '#f5a623',
        svg:
            '<polygon points="12,1 19,17 12,13.5 5,17" />' +
            '<line x1="12" y1="2" x2="12" y2="13.5" stroke="#ffffff" stroke-width="0.8" opacity="0.6" />',
    },
    uav_recon: {
        color: '#5b8fb0',
        svg:
            '<path d="M12 1 L13 12 L22 12 L22 13.5 L13 13.5 L13.5 20.5 L16.5 22.5 L16.5 23.5 L12 22.3 ' +
            'L7.5 23.5 L7.5 22.5 L10.5 20.5 L11 13.5 L2 13.5 L2 12 L11 12 Z" />',
    },
    fpv: {
        color: '#ff6b35',
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
        svg: '<ellipse cx="12" cy="15" rx="4.2" ry="7.5" /><polygon points="7.5,8 3,2 8.5,5.5" /><polygon points="16.5,8 21,2 15.5,5.5" /><polygon points="10.5,7 13.5,7 12,1" />',
    },
    missile: {
        color: '#991b1b',
        svg: '<polygon points="12,1 15,9 15,20 9,20 9,9" /><polygon points="9,15.5 4,22 9,19.5" /><polygon points="15,15.5 20,22 15,19.5" /><polygon points="10.5,17 13.5,17 12,23" />',
    },
    mig31k: {
        color: '#7c3aed',
        svg: '<path d="M12 1 L13 14 L21 21 L21 22.5 L13 18 L13.5 22.5 L16 24 L12 23 L8 24 L10.5 22.5 L11 18 L3 22.5 L3 21 L11 14 Z" />',
    },
    unknown: {
        color: '#6b7280',
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
// `uncertain` gets a dashed outline instead of the normal solid white one - a quick visual cue
// that Neptun itself hasn't confirmed this one yet, without needing to open the tooltip to find
// out. Only lifecycle drives this, not `status` - every threat in the feed is "active" by
// definition of being in it, so that field never actually varies in practice.
function iconHtml(typeKey, rotationDeg, lifecycle) {
    const { color, svg } = TYPE_ICONS[typeKey];
    const rotation = typeof rotationDeg === 'number' ? `transform: rotate(${rotationDeg}deg);` : '';
    const uncertainClass = lifecycle === 'uncertain' ? ' threat-icon-uncertain' : '';
    return (
        `<div class="threat-icon${uncertainClass}" style="color: ${color};">` +
        `<div class="threat-icon-rotate" style="${rotation}">` +
        `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="#ffffff" stroke-width="1">${svg}</svg>` +
        `</div></div>`
    );
}

function threatIcon(threat) {
    const typeKey = resolveTypeKey(threat);
    const rotation = typeof threat.heading === 'number' ? threat.heading : undefined;

    return L.divIcon({
        className: 'threat-icon-wrapper',
        html: iconHtml(typeKey, rotation, threat.lifecycle),
        iconSize: [22, 22],
        iconAnchor: [11, 11],
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

// Only lists the threat types actually on the map right now, not the full fixed set - a legend
// entry for a type nothing currently shows is a row explaining nothing. update() is called on
// every render with whichever types are present; the legend hides itself entirely rather than
// show an empty box during a fully quiet stretch.
function buildLegend(strings) {
    const legend = L.control({ position: 'bottomleft' });
    let container = null;

    legend.onAdd = () => {
        container = L.DomUtil.create('div', 'threat-legend');
        legend.update([]);
        return container;
    };

    legend.update = (presentTypeKeys) => {
        if (!container) return;
        const keys = ALL_TYPE_KEYS.filter((key) => presentTypeKeys.includes(key));

        if (!keys.length) {
            container.style.display = 'none';
            return;
        }

        container.style.display = '';
        const rows = keys
            .map((typeKey) => `<div class="legend-row">${iconHtml(typeKey)}<span>${escapeHtml(strings[`liveMapType_${typeKey}`])}</span></div>`)
            .join('');
        container.innerHTML = `<div class="legend-title">${escapeHtml(strings.liveMapLegendTitle)}</div>${rows}`;
    };

    return legend;
}

function startNeptunLayer(map, strings, language) {
    if (!map.getPane(THREATS_PANE)) {
        map.createPane(THREATS_PANE).style.zIndex = THREATS_PANE_Z;
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
        legend.update(valid.map((t) => resolveTypeKey(t)));

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

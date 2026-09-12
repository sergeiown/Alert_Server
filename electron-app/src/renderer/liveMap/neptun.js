// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { normalizeOblastName, oblastDisplayName } from './regionNameUtils.js';
import { transliterate } from './transliterate.js';

const THREATS_URL = 'https://neptun.in.ua/api/v1/threats';
const STREAM_URL = 'wss://neptun.in.ua/api/v1/stream';
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 30000;

const SNAPSHOT_REFRESH_MS = 60000;

function logNetwork(message) {
    window.alertServerLiveMap.logNetworkEvent(message);
}

const TOOLTIP_MAX_WIDTH_PX = 410;
const TOOLTIP_MIN_WIDTH_PX = 90;
const TOOLTIP_WIDTH_PADDING_PX = 14;

const MISSILE_TYPE_ALIASES = ['missile', 'rocket', 'cruise_missile', 'ballistic'];
const RECON_TITLE_PATTERN = /розвід/i;

const THREATS_PANE = 'threatsPane';
const THREATS_PANE_Z = 620;

const UNCERTAINTY_PANE = 'threatsUncertaintyPane';
const UNCERTAINTY_PANE_Z = 410;
const UNCERTAINTY_CIRCLE_COLOR = '#6b7280';
const UNCERTAIN_ICON_COLOR = '#9ca3af';

const MARKER_MIN_GAP_BASE_PX = 18;
const MARKER_MIN_GAP_JITTER_PX = 6;
const DECLUTTER_ITERATIONS = 40;

function pairFraction(i, j) {
    const seed = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    return seed - Math.floor(seed);
}

function declutterPoints(points) {
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

                const minGap = MARKER_MIN_GAP_BASE_PX + pairFraction(i, j) * MARKER_MIN_GAP_JITTER_PX;

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

const DEFAULT_ICON_SIZE_PX = 22;

const MAP_ICON_SIZE_OVERRIDES = { uav: 18, fpv: 18, missile: 26 };

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

const APPROX_SWATCH_HTML =
    `<span class="legend-swatch"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${UNCERTAINTY_CIRCLE_COLOR}" ` +
    'stroke-width="1.2" stroke-opacity="0.45" stroke-dasharray="3 2.5"><circle cx="12" cy="12" r="10"/></svg></span>';

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

function startNeptunLayer(map, strings, language, onCountChange, readyPromise) {
    if (!map.getPane(THREATS_PANE)) {
        map.createPane(THREATS_PANE).style.zIndex = THREATS_PANE_Z;
    }
    if (!map.getPane(UNCERTAINTY_PANE)) {
        map.createPane(UNCERTAINTY_PANE).style.zIndex = UNCERTAINTY_PANE_Z;
    }

    const layer = L.layerGroup().addTo(map);
    const circlesGroup = L.layerGroup().addTo(layer);
    const activeMarkers = new Map();
    const activeCircles = new Map();
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

    const MARKER_FADE_MS = 600;

    function revealWhenReady(reveal) {
        if (readyPromise) readyPromise.then(reveal);
        else reveal();
    }

    function fadeInMarker(marker) {
        marker.setOpacity(0);
        const el = marker.getElement();
        if (el) el.style.transition = `opacity ${MARKER_FADE_MS}ms ease`;

        revealWhenReady(() => {
            if (el) void el.offsetWidth;
            marker.setOpacity(1);
        });
    }

    function fadeOutAndRemove(marker) {
        const el = marker.getElement();
        if (!el) {
            layer.removeLayer(marker);
            return;
        }
        el.style.transition = `opacity ${MARKER_FADE_MS}ms ease`;
        marker.setOpacity(0);
        setTimeout(() => layer.removeLayer(marker), MARKER_FADE_MS);
    }

    function fadeInCircle(circle) {
        const el = circle.getElement();
        if (el) {
            el.style.transition = `opacity ${MARKER_FADE_MS}ms ease`;
            el.style.opacity = '0';
        }

        revealWhenReady(() => {
            if (el) {
                void el.offsetWidth;
                el.style.opacity = '1';
            }
        });
    }

    function fadeOutAndRemoveCircle(circle) {
        const el = circle.getElement();
        if (!el) {
            circlesGroup.removeLayer(circle);
            return;
        }
        el.style.transition = `opacity ${MARKER_FADE_MS}ms ease`;
        el.style.opacity = '0';
        setTimeout(() => circlesGroup.removeLayer(circle), MARKER_FADE_MS);
    }

    function renderThreats(threats) {
        if (!Array.isArray(threats)) return;
        lastThreats = threats;

        const valid = threats.filter((t) => typeof t.lat === 'number' && typeof t.lon === 'number');
        legend.update({
            confirmedTypeKeys: valid.filter((t) => t.lifecycle !== 'uncertain').map((t) => resolveTypeKey(t)),
            uncertainTypeKeys: valid.filter((t) => t.lifecycle === 'uncertain').map((t) => resolveTypeKey(t)),
            hasApprox: valid.some((t) => t.positionQuality === 'approx' && typeof t.uncertaintyKm === 'number'),
        });
        if (typeof onCountChange === 'function') onCountChange(valid.length);

        const approxThreats = valid.filter((t) => t.positionQuality === 'approx' && typeof t.uncertaintyKm === 'number');
        const currentCircleIds = new Set(approxThreats.map((t) => t.id));

        activeCircles.forEach((circle, id) => {
            if (!currentCircleIds.has(id)) {
                fadeOutAndRemoveCircle(circle);
                activeCircles.delete(id);
            }
        });

        approxThreats.forEach((threat) => {
            const existing = activeCircles.get(threat.id);
            if (existing) {
                existing.setLatLng([threat.lat, threat.lon]);
                existing.setRadius(threat.uncertaintyKm * 1000);
                return;
            }

            const circle = L.circle([threat.lat, threat.lon], {
                pane: UNCERTAINTY_PANE,
                radius: threat.uncertaintyKm * 1000,
                color: UNCERTAINTY_CIRCLE_COLOR,
                weight: 1,
                opacity: 0.45,
                dashArray: '4 5',
                fill: false,
                interactive: false,
                className: 'threat-uncertainty-circle',
            }).addTo(circlesGroup);
            activeCircles.set(threat.id, circle);
            fadeInCircle(circle);
        });

        const currentIds = new Set(valid.map((t) => t.id));
        activeMarkers.forEach((marker, id) => {
            if (!currentIds.has(id)) {
                fadeOutAndRemove(marker);
                activeMarkers.delete(id);
            }
        });

        const points = valid.map((t) => map.latLngToContainerPoint([t.lat, t.lon]));
        const spread = declutterPoints(points);

        valid.forEach((threat, i) => {
            const displayLatLng = map.containerPointToLatLng([spread[i].x, spread[i].y]);
            const existing = activeMarkers.get(threat.id);
            const iconSig = `${resolveTypeKey(threat)}|${threat.heading ?? ''}|${threat.lifecycle}`;

            if (existing) {
                existing.setLatLng(displayLatLng);
                if (existing._iconSig !== iconSig) {
                    existing.setIcon(threatIcon(threat));
                    existing._iconSig = iconSig;
                }
                existing.setTooltipContent(tooltipContent(threat, strings, isEnglish));
                return;
            }

            const marker = L.marker(displayLatLng, { icon: threatIcon(threat), pane: THREATS_PANE })
                .bindTooltip(tooltipContent(threat, strings, isEnglish))
                .on('mouseover', () => map.closePopup())
                .addTo(layer);
            marker._iconSig = iconSig;
            activeMarkers.set(threat.id, marker);
            fadeInMarker(marker);
        });
    }

    map.on('zoomend', () => renderThreats(lastThreats));

    let fallbackTimer = null;
    let usingFallback = false;

    async function fetchSnapshot() {
        try {
            const response = await fetch(THREATS_URL);
            if (!response.ok) {
                logNetwork(`Neptun snapshot fetch failed: ${response.status}`);
                return;
            }
            const data = await response.json();
            logNetwork(`Neptun threats updated (snapshot): ${(data.threats || []).length} active`);
            renderThreats(data.threats);
        } catch (err) {
            logNetwork(`Neptun snapshot fetch error: ${err.message}`);
        }
    }

    function startFallbackPolling() {
        if (usingFallback) return;
        usingFallback = true;
        logNetwork('Neptun: stream unavailable, falling back to polling');
        fetchSnapshot();
        fallbackTimer = setInterval(fetchSnapshot, SNAPSHOT_REFRESH_MS);
    }

    function stopFallbackPolling() {
        if (!usingFallback) return;
        usingFallback = false;
        if (fallbackTimer) clearInterval(fallbackTimer);
        fallbackTimer = null;
        logNetwork('Neptun: stream recovered, stopping fallback polling');
    }

    function resetHeartbeatWatch() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
            logNetwork('Neptun stream: no messages received, reconnecting');
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
            logNetwork(`Neptun stream connection failed: ${err.message}`);
            reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
            return;
        }

        socket.addEventListener('message', (event) => {
            resetHeartbeatWatch();
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'snapshot') {
                    stopFallbackPolling();
                    logNetwork(`Neptun threats updated (stream): ${(message.data?.threats || []).length} active`);
                    renderThreats(message.data?.threats);
                }
            } catch (err) {
                logNetwork(`Neptun stream message parse failed: ${err.message}`);
            }
        });

        socket.addEventListener('open', () => {
            logNetwork('Neptun stream connected');
            resetHeartbeatWatch();
        });

        socket.addEventListener('close', () => {
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
            startFallbackPolling();
            reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        });

        socket.addEventListener('error', (event) => {
            logNetwork(`Neptun stream error: ${event.message || 'unknown error'}`);
        });
    }

    function begin() {
        connect();
    }

    begin();

    return layer;
}

export { startNeptunLayer };

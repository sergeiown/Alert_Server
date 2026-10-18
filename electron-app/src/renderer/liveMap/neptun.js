// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { normalizeOblastName, oblastDisplayName } from './regionNameUtils.js';
import { transliterate } from './transliterate.js';
import { RAION_MIN_ZOOM } from './zoomTiers.js';
import { KYIV_RAION_BORDERS } from './kyivRaionBorders.js';

function ringContains(ring, lat, lng) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [latI, lngI] = ring[i];
        const [latJ, lngJ] = ring[j];
        if (latI > lat !== latJ > lat && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
    }
    return inside;
}

const KYIV_RINGS = Object.values(KYIV_RAION_BORDERS);

function isInsideKyiv(position) {
    return KYIV_RINGS.some((ring) => ringContains(ring, position[0], position[1]));
}

const TOOLTIP_MAX_WIDTH_PX = 410;
const TOOLTIP_MIN_WIDTH_PX = 90;
const TOOLTIP_WIDTH_PADDING_PX = 14;

const MISSILE_TYPE_ALIASES = ['missile', 'rocket', 'cruise_missile', 'ballistic'];
const RECON_TITLE_PATTERN = /розвід/i;

const THREATS_PANE = 'threatsPane';
const THREATS_PANE_Z = 620;

const UNCERTAINTY_PANE = 'threatsUncertaintyPane';
const UNCERTAINTY_PANE_Z = 615;
const UNCERTAINTY_CIRCLE_COLOR = '#6b7280';
const UNCERTAIN_ICON_COLOR = '#9ca3af';

const CLUSTER_RADIUS_DESKTOP_PX = 26;
const CLUSTER_RADIUS_TOUCH_PX = 38;
const CLUSTER_ICON_DESKTOP_PX = 28;
const CLUSTER_ICON_TOUCH_PX = 36;
const AREA_HIT_WEIGHT_PX = 22;
const AREA_ONLY_DEFAULT_KM = 70;
const TYPE_PRIORITY = ['missile', 'mig31k', 'kab', 'uav', 'fpv', 'uav_recon', 'unknown'];

function isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches;
}

function clusterRadiusPx(sizeMultiplier) {
    return (isTouchDevice() ? CLUSTER_RADIUS_TOUCH_PX : CLUSTER_RADIUS_DESKTOP_PX) * sizeMultiplier;
}

function clusterPoints(items, radiusPx) {
    const sorted = [...items].sort((p, q) => (p.threat.id < q.threat.id ? -1 : 1));
    const grid = new Map();
    const cellOf = (value) => Math.floor(value / radiusPx);
    sorted.forEach((item) => {
        const key = cellOf(item.x) + ':' + cellOf(item.y);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(item);
    });

    const taken = new Set();
    const clusters = [];
    sorted.forEach((seed) => {
        if (taken.has(seed)) return;
        taken.add(seed);
        const members = [seed];
        const cx = cellOf(seed.x);
        const cy = cellOf(seed.y);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                (grid.get(cx + dx + ':' + (cy + dy)) || []).forEach((other) => {
                    if (taken.has(other)) return;
                    if (Math.hypot(other.x - seed.x, other.y - seed.y) <= radiusPx) {
                        taken.add(other);
                        members.push(other);
                    }
                });
            }
        }
        clusters.push(members);
    });
    return clusters;
}

function dominantTypeKey(threats) {
    const keys = threats.map((threat) => resolveTypeKey(threat));
    return TYPE_PRIORITY.find((key) => keys.includes(key)) || 'unknown';
}

const TYPE_ICONS = {
    uav: {
        color: '#f5a623',
        align: 'translate(12,12) scale(1.04) translate(-12,-12)',
        svg:
            '<path d="M12 1 C12.9 1 13.2 2.2 13.1 4.5 V7.2 L20.5 18.8 C20.6 19 20.65 19.2 20.65 19.4 V23 H20.2 V22 H13.6 L13.4 21.7 H10.6 L10.4 22 H3.8 V23 H3.35 V19.4 C3.35 19.2 3.4 19 3.5 18.8 L10.9 7.2 V4.5 C10.8 2.2 11.1 1 12 1 Z" />' +
            '<line x1="12" y1="2.6" x2="12" y2="21.4" stroke="#3a3d42" stroke-width="1" stroke-linecap="round" opacity="0.8" />',
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

function threatIcon(threat, sizeMultiplier = 1) {
    const typeKey = resolveTypeKey(threat);
    const rotation = typeof threat.heading === 'number' ? threat.heading : undefined;
    const sizePx = Math.round((MAP_ICON_SIZE_OVERRIDES[typeKey] || DEFAULT_ICON_SIZE_PX) * sizeMultiplier * (window.alertServerLiveMap.threatIconScale || 1));

    return L.divIcon({
        className: 'threat-icon-wrapper',
        html: iconHtml(typeKey, rotation, threat.lifecycle, sizePx),
        iconSize: [sizePx, sizePx],
        iconAnchor: [sizePx / 2, sizePx / 2],
    });
}

function clusterIcon(count, typeKey, allUncertain, sizeMultiplier) {
    const { color, svg, align } = TYPE_ICONS[typeKey];
    const sizePx = Math.round((isTouchDevice() ? CLUSTER_ICON_TOUCH_PX : CLUSTER_ICON_DESKTOP_PX) * sizeMultiplier);
    const fillColor = allUncertain ? UNCERTAIN_ICON_COLOR : color;
    const label = count > 99 ? '99+' : String(count);
    return L.divIcon({
        className: 'threat-icon-wrapper threat-cluster',
        html:
            `<div class="threat-icon" style="color: ${fillColor};">` +
            `<svg viewBox="0 0 24 24" width="${sizePx}" height="${sizePx}" fill="currentColor" stroke="#ffffff" stroke-width="1">` +
            `<g transform="${align}">${svg}</g></svg>` +
            `<span class="threat-cluster-badge${label.length > 2 ? ' threat-cluster-badge-wide' : ''}">${label}</span></div>`,
        iconSize: [sizePx, sizePx],
        iconAnchor: [sizePx / 2, sizePx / 2],
    });
}

function clusterTooltipContent(threats, strings, canSplit) {
    const counts = new Map();
    threats.forEach((threat) => {
        const key = resolveTypeKey(threat);
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    const rows = TYPE_PRIORITY.filter((key) => counts.has(key)).map(
        (key) => `${escapeHtml(strings[`liveMapType_${key}`])}: ${counts.get(key)}`
    );
    return [
        `<strong>${escapeHtml(strings.liveMapClusterTitle.replace('{count}', threats.length))}</strong>`,
        ...rows,
        `<small>${escapeHtml(canSplit ? strings.liveMapClusterTap : strings.liveMapClusterExpand)}</small>`,
    ].join('<br>');
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
        threat.areaOnly ? escapeHtml(strings.liveMapAreaOnlyNote) : '',
        escapeHtml(locationLine),
        escapeHtml(confirmationsLine),
        `<small>${strings.liveMapConfidenceLabel} ${escapeHtml(confidenceLabel(threat, strings))}${updatedTime ? ` · ${strings.liveMapUpdated}: ${updatedTime}` : ''}</small>`,
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

const AREA_SWATCH_HTML =
    '<span class="legend-swatch"><svg viewBox="0 0 24 24" width="18" height="18" fill="#6b7280" fill-opacity="0.18" stroke="#6b7280" ' +
    'stroke-width="1.5" stroke-dasharray="3 2.5"><circle cx="12" cy="12" r="10"/></svg></span>';

const APPROX_SWATCH_HTML =
    `<span class="legend-swatch"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="${UNCERTAINTY_CIRCLE_COLOR}" ` +
    'stroke-width="1.5" stroke-opacity="0.9" stroke-dasharray="3 2.5"><circle cx="12" cy="12" r="10"/></svg></span>';

function buildLegend(strings) {
    const legend = L.control({ position: 'bottomleft' });
    let container = null;

    legend.onAdd = () => {
        container = L.DomUtil.create('div', 'threat-legend');
        legend.update({ confirmedTypeKeys: [], uncertainTypeKeys: [], hasApprox: false, hasArea: false });
        return container;
    };

    legend.update = ({ confirmedTypeKeys, uncertainTypeKeys, hasApprox, hasArea }) => {
        if (!container) return;
        const confirmedKeys = ALL_TYPE_KEYS.filter((key) => confirmedTypeKeys.includes(key));
        const uncertainKeys = ALL_TYPE_KEYS.filter((key) => uncertainTypeKeys.includes(key));

        if (!confirmedKeys.length && !uncertainKeys.length && !hasApprox && !hasArea) {
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
        const areaRow = hasArea
            ? `<div class="legend-row">${AREA_SWATCH_HTML}<span>${escapeHtml(strings.liveMapLegendArea)}</span></div>`
            : '';
        container.innerHTML = `<div class="legend-title">${escapeHtml(strings.liveMapLegendTitle)}</div>${confirmedRows}${uncertainRows}${approxRow}${areaRow}`;
    };

    return legend;
}

function buildHint(strings) {
    const hint = L.control({ position: 'bottomright' });
    let container = null;

    hint.onAdd = () => {
        container = L.DomUtil.create('div', 'threat-hint');
        hint.update({ hasThreats: false, hasClusters: false });
        return container;
    };

    hint.update = ({ hasThreats, hasClusters }) => {
        if (!container) return;
        const rows = [
            strings.liveMapHintRealtime,
            strings.liveMapHintClickMap,
            hasThreats ? strings.liveMapHintHoverThreat : null,
            hasClusters ? strings.liveMapHintCluster : null,
        ]
            .filter(Boolean)
            .map((text) => `<div class="hint-row">${escapeHtml(text)}</div>`)
            .join('');
        container.innerHTML =
            `<div class="hint-title">${escapeHtml(strings.liveMapHintTitle)}</div>${rows}` +
            `<div class="hint-disclaimer">${escapeHtml(strings.liveMapHintDisclaimer)}</div>`;
    };

    return hint;
}

const ControlLayer = L.Layer.extend({
    initialize(control) {
        this._control = control;
    },
    onAdd(map) {
        this._control.addTo(map);
    },
    onRemove(map) {
        map.removeControl(this._control);
    },
});

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
    const activeAreas = new Map();
    const activeClusters = new Map();
    let expanded = null;
    const driftById = new Map();
    const isEnglish = language === 'English';
    let lastThreats = [];
    let kyivMode = false;

    const legend = buildLegend(strings);
    const legendLayer = new ControlLayer(legend);
    legendLayer.addTo(map);

    const hint = buildHint(strings);
    const hintLayer = new ControlLayer(hint);
    hintLayer.addTo(map);

    const selectHandler = window.alertServerLiveMap.onThreatSelect;
    let selectedThreatId = null;

    function clearSelectedThreat() {
        if (!selectHandler || selectedThreatId === null) return;
        selectedThreatId = null;
        selectHandler(null);
    }

    if (selectHandler) map.on('click', clearSelectedThreat);

    function collapseExpanded() {
        if (!expanded) return;
        expanded = null;
        renderThreats(lastThreats);
    }

    map.on('click', collapseExpanded);
    map.on('zoomstart', () => {
        expanded = null;
    });

    map.on('tooltipopen', (e) => {
        const el = e.tooltip.getElement();
        if (!el) return;
        el.style.width = `${measureTooltipWidth(el)}px`;
        e.tooltip.update();
    });

    const MARKER_FADE_MS = 750;
    const MARKER_FADE_SPREAD_MS = 120;
    const ICON_APPEAR_DURATION_MS = 1300;
    const ICON_APPEAR_SPREAD_MS = 180;
    const ICON_APPEAR_START_SCALE = 2.2;
    const ICON_APPEAR_DROP_PX = 60;
    const ICON_APPEAR_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
    const KYIV_ICON_SCALE = 1.2;
    const MOVE_DURATION_MS = 1300;
    const MOVE_SPREAD_MS = 200;
    const SHRINK_DURATION_MS = 650;
    const SHRINK_SPREAD_MS = 100;
    const FLASH_DURATION_MS = 950;
    const FLASH_SPREAD_MS = 150;
    const DEBRIS_DURATION_MS = 1900;
    const DEBRIS_SPREAD_MS = 250;
    const DEBRIS_COUNT = 9;
    const CIRCLE_DRAW_DURATION_MS = 1500;
    const CIRCLE_DRAW_SPREAD_MS = 200;
    const CIRCLE_DRAW_DELAY_MS = ICON_APPEAR_DURATION_MS + 200;
    const CIRCLE_REDRAW_DELAY_MS = MOVE_DURATION_MS + 100;
    const ROTATE_DURATION_MS = 900;
    const ROTATE_SPREAD_MS = 150;
    const ICON_SWAP_DURATION_MS = 450;
    const ICON_SWAP_SPREAD_MS = 80;
    const EXTRAPOLATION_TICK_MS = 1000;
    const DRIFT_SPEED_KMH = 53;
    const DRIFT_SPEED_REFERENCE_ZOOM = 9;
    const DRIFT_SPEED_MAX_KMH = 210;
    const MAX_DRIFT_MS = 120000;
    const DRIFTING_TYPE_KEYS = new Set(['uav', 'uav_recon', 'fpv']);
    const KYIV_THREAT_CLICK_ZOOM = 12;

    function randomDuration(baseMs, spreadMs) {
        return Math.round(baseMs + (Math.random() * 2 - 1) * spreadMs);
    }

    function updateVelocityEstimate(threat, now) {
        const canDrift = DRIFTING_TYPE_KEYS.has(resolveTypeKey(threat)) && typeof threat.heading === 'number';
        if (!canDrift) {
            driftById.delete(threat.id);
            return;
        }
        driftById.set(threat.id, { heading: threat.heading, baseLat: threat.lat, baseLon: threat.lon, baseTime: now });
    }

    function extrapolatedThreats() {
        if (!lastThreats.length) return lastThreats;
        const now = Date.now();

        return lastThreats.map((threat) => {
            const drift = driftById.get(threat.id);
            if (!drift) return threat;

            const elapsed = Math.min(now - drift.baseTime, MAX_DRIFT_MS);
            if (elapsed <= 0) return threat;

            const marker = activeMarkers.get(threat.id);
            const facingDeg = marker && typeof marker._headingDeg === 'number' ? marker._headingDeg : drift.heading;
            const headingRad = (facingDeg * Math.PI) / 180;
            const zoomFactor = Math.pow(2, map.getZoom() - DRIFT_SPEED_REFERENCE_ZOOM);
            const speedKmh = Math.min(DRIFT_SPEED_KMH * zoomFactor, DRIFT_SPEED_MAX_KMH);
            const speedDegPerMs = speedKmh / 3.6 / 1000 / 111320;
            const distanceDeg = speedDegPerMs * elapsed;
            const latRad = (drift.baseLat * Math.PI) / 180;

            return {
                ...threat,
                lat: drift.baseLat + Math.cos(headingRad) * distanceDeg,
                lon: drift.baseLon + (Math.sin(headingRad) * distanceDeg) / Math.cos(latRad),
            };
        });
    }

    function revealWhenReady(reveal) {
        if (readyPromise) readyPromise.then(reveal);
        else reveal();
    }

    function fadeInMarker(marker) {
        marker.setOpacity(0);
        const el = marker.getElement();
        const inner = el ? el.querySelector('.threat-icon') : null;
        const duration = randomDuration(ICON_APPEAR_DURATION_MS, ICON_APPEAR_SPREAD_MS);
        if (el) el.style.transition = `opacity ${duration}ms ease`;
        if (inner) {
            inner.style.transition = `transform ${duration}ms ${ICON_APPEAR_EASING}`;
            inner.style.transform = `translateY(-${ICON_APPEAR_DROP_PX}px) scale(${ICON_APPEAR_START_SCALE})`;
        }

        revealWhenReady(() => {
            if (el) void el.offsetWidth;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    marker.setOpacity(1);
                    if (inner) inner.style.transform = 'translateY(0) scale(1)';
                });
            });
        });
    }

    function spawnExplosion(el) {
        const burst = document.createElement('div');
        burst.className = 'threat-explosion';

        const flashDuration = randomDuration(FLASH_DURATION_MS, FLASH_SPREAD_MS);
        const flash = document.createElement('span');
        flash.className = 'threat-explosion-flash';
        flash.style.transition = `transform ${flashDuration}ms ease-in-out, opacity ${flashDuration}ms ease-in-out`;
        burst.appendChild(flash);

        const fragments = [];
        let longestDebrisMs = 0;
        for (let i = 0; i < DEBRIS_COUNT; i++) {
            const angle = (Math.PI * 2 * i) / DEBRIS_COUNT + (Math.random() - 0.5) * 0.7;
            const distance = 28 + Math.random() * 26;
            const size = 5 + Math.random() * 3.5;
            const fragDuration = randomDuration(DEBRIS_DURATION_MS, DEBRIS_SPREAD_MS);
            longestDebrisMs = Math.max(longestDebrisMs, fragDuration);

            const frag = document.createElement('span');
            frag.className = 'threat-debris';
            frag.style.width = `${size}px`;
            frag.style.height = `${size}px`;
            frag.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
            frag.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
            frag.style.setProperty('--rot', `${(Math.random() - 0.5) * 360}deg`);
            frag.style.transition = `transform ${fragDuration}ms ease-in-out, opacity ${fragDuration}ms ease-in-out`;
            burst.appendChild(frag);
            fragments.push(frag);
        }

        el.appendChild(burst);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                flash.classList.add('exploding');
                fragments.forEach((frag) => frag.classList.add('exploding'));
            });
        });

        return Math.max(flashDuration, longestDebrisMs);
    }

    function fadeOutAndRemove(marker, explode = true) {
        const el = marker.getElement();
        if (!el) {
            layer.removeLayer(marker);
            return;
        }
        const shrinkDuration = randomDuration(SHRINK_DURATION_MS, SHRINK_SPREAD_MS);
        const inner = el.querySelector('.threat-icon');
        if (inner) {
            inner.style.transition = `opacity ${shrinkDuration}ms ease, transform ${shrinkDuration}ms ease`;
            inner.style.opacity = '0';
            inner.style.transform = 'scale(0.6)';
        }
        const explosionDuration = explode ? spawnExplosion(el) : 0;
        setTimeout(() => layer.removeLayer(marker), Math.max(shrinkDuration, explosionDuration) + 50);
    }

    function drawCircleStroke(circle, delayMs) {
        const el = circle.getElement();
        if (!el) return;

        let length = 0;
        try {
            length = typeof el.getTotalLength === 'function' ? el.getTotalLength() : 0;
        } catch {
            length = 0;
        }
        if (!length) return;

        el.style.transition = '';
        el.style.strokeDasharray = `${length}`;
        el.style.strokeDashoffset = `${length}`;

        revealWhenReady(() => {
            setTimeout(() => {
                const duration = randomDuration(CIRCLE_DRAW_DURATION_MS, CIRCLE_DRAW_SPREAD_MS);
                void el.getBoundingClientRect();
                el.style.transition = `stroke-dashoffset ${duration}ms linear`;
                el.style.strokeDashoffset = '0';

                setTimeout(() => {
                    el.style.transition = '';
                    el.style.strokeDasharray = '';
                    el.style.strokeDashoffset = '';
                }, duration + 30);
            }, delayMs);
        });
    }

    function normalizedDelta(fromDeg, toDeg) {
        return (((toDeg - fromDeg) % 360) + 540) % 360 - 180;
    }

    function applyIconRotation(marker, threat, animate) {
        const el = marker.getElement();
        const rotateEl = el ? el.querySelector('.threat-icon-rotate') : null;
        if (!rotateEl) return;

        if (typeof threat.heading !== 'number') {
            marker._headingDeg = undefined;
            rotateEl.style.transition = '';
            rotateEl.style.transform = '';
            return;
        }

        if (!animate || typeof marker._headingDeg !== 'number') {
            marker._headingDeg = threat.heading;
            rotateEl.style.transition = '';
            rotateEl.style.transform = `rotate(${threat.heading}deg)`;
            return;
        }

        const unwrapped = marker._headingDeg + normalizedDelta(marker._headingDeg % 360, threat.heading);
        const duration = randomDuration(ROTATE_DURATION_MS, ROTATE_SPREAD_MS);
        rotateEl.style.transition = `transform ${duration}ms ease-in-out`;
        rotateEl.style.transform = `rotate(${unwrapped}deg)`;
        marker._headingDeg = unwrapped;
    }

    function animateIconSwap(marker, makeIcon, afterSwap) {
        const el = marker.getElement();
        const inner = el ? el.querySelector('.threat-icon') : null;
        const duration = randomDuration(ICON_SWAP_DURATION_MS, ICON_SWAP_SPREAD_MS);
        const apply = () => {
            marker.setIcon(makeIcon());
            if (afterSwap) afterSwap();
        };

        if (!inner) {
            apply();
            return;
        }

        inner.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
        inner.style.opacity = '0';
        inner.style.transform = 'scale(0.5)';

        setTimeout(() => {
            apply();
            const newEl = marker.getElement();
            const newInner = newEl ? newEl.querySelector('.threat-icon') : null;
            if (!newInner) return;

            newInner.style.transition = 'none';
            newInner.style.opacity = '0';
            newInner.style.transform = 'scale(0.5)';
            void newEl.offsetWidth;

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    newInner.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`;
                    newInner.style.opacity = '1';
                    newInner.style.transform = 'scale(1)';
                });
            });
        }, duration);
    }

    let zoomHideToken = 0;

    function hideDuringMove(targetLatLng, targetZoom) {
        const zoomChanges = Math.abs(targetZoom - map.getZoom()) >= 0.01;
        const moves = map.latLngToContainerPoint(targetLatLng).distanceTo(map.getSize().divideBy(2)) > 4;
        if (!zoomChanges && !moves) return;
        const container = map.getContainer();
        const token = ++zoomHideToken;
        container.classList.add('threats-zoom-hidden');
        const reveal = () => {
            if (token !== zoomHideToken) return;
            map.off('moveend', reveal);
            container.classList.remove('threats-zoom-hidden');
        };
        map.once('moveend', reveal);
        setTimeout(reveal, 2200);
    }

    function splitZoom(members, sizeMultiplier) {
        const radius = clusterRadiusPx(sizeMultiplier);
        for (let zoom = Math.floor(map.getZoom()) + 1; zoom <= map.getMaxZoom(); zoom++) {
            const projected = members.map((threat) => {
                const point = map.project([threat.lat, threat.lon], zoom);
                return { threat, x: point.x, y: point.y };
            });
            if (clusterPoints(projected, radius).length > 1) return zoom;
        }
        return null;
    }

    function zoomIntoCluster(marker) {
        const members = marker._members;
        const bounds = L.latLngBounds(members.map((threat) => [threat.lat, threat.lon]));
        const center = bounds.getCenter();
        const targetZoom = splitZoom(members, kyivMode ? KYIV_ICON_SCALE : 1);
        marker.closeTooltip();
        if (targetZoom !== null) {
            hideDuringMove(center, targetZoom);
            map.flyTo(center, targetZoom, { animate: true, duration: 0.6 });
            return;
        }
        const maxZoom = map.getMaxZoom();
        const expand = () => {
            expanded = { seedId: marker._seedId };
            renderThreats(lastThreats);
        };
        if (map.getZoom() < maxZoom - 0.01) {
            hideDuringMove(center, maxZoom);
            map.once('moveend', expand);
            map.flyTo(center, maxZoom, { animate: true, duration: 0.6 });
            return;
        }
        expand();
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

    function renderThreats(threats, options = {}) {
        const { isZoomEvent = false, isExtrapolation = false } = options;
        if (!Array.isArray(threats)) return;
        if (!isExtrapolation) lastThreats = threats;

        const valid = threats.filter((t) => typeof t.lat === 'number' && typeof t.lon === 'number');

        if (!isExtrapolation) {
            const now = Date.now();
            valid.forEach((threat) => updateVelocityEstimate(threat, now));
        }

        const areaThreats = valid.filter((t) => t.areaOnly);
        const pointThreats = valid.filter((t) => !t.areaOnly);
        const sizeMultiplier = kyivMode ? KYIV_ICON_SCALE : 1;
        const currentIdsAll = new Set(valid.map((t) => t.id));

        const items = pointThreats.map((threat) => {
            const point = map.latLngToContainerPoint([threat.lat, threat.lon]);
            return { threat, x: point.x, y: point.y };
        });
        const groups = clusterPoints(items, clusterRadiusPx(sizeMultiplier));
        const clusterGroups = groups.filter((members) => members.length > 1);
        const singles = groups.filter((members) => members.length === 1).map((members) => members[0].threat);
        const spreadPos = new Map();

        if (expanded) {
            const index = clusterGroups.findIndex((members) => members[0].threat.id === expanded.seedId);
            if (index < 0) {
                expanded = null;
            } else {
                const members = clusterGroups.splice(index, 1)[0];
                const cx = members.reduce((sum, m) => sum + m.x, 0) / members.length;
                const cy = members.reduce((sum, m) => sum + m.y, 0) / members.length;
                const radius = Math.max(38, 14 + members.length * 8) * sizeMultiplier;
                members.forEach((m, i) => {
                    const angle = -Math.PI / 2 + (2 * Math.PI * i) / members.length;
                    const point = map.containerPointToLatLng([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
                    spreadPos.set(m.threat.id, [point.lat, point.lng]);
                    singles.push(m.threat);
                });
            }
        }

        legend.update({
            confirmedTypeKeys: pointThreats.filter((t) => t.lifecycle !== 'uncertain').map((t) => resolveTypeKey(t)),
            uncertainTypeKeys: pointThreats.filter((t) => t.lifecycle === 'uncertain').map((t) => resolveTypeKey(t)),
            hasApprox: pointThreats.some((t) => t.positionQuality === 'approx' && typeof t.uncertaintyKm === 'number'),
            hasArea: areaThreats.length > 0,
        });
        if (typeof onCountChange === 'function') onCountChange(valid.length);
        hint.update({ hasThreats: valid.length > 0, hasClusters: clusterGroups.length > 0 });

        const approxThreats = singles.filter((t) => t.positionQuality === 'approx' && typeof t.uncertaintyKm === 'number');
        const currentCircleIds = new Set(approxThreats.map((t) => t.id));

        activeCircles.forEach((circle, id) => {
            if (!currentCircleIds.has(id)) {
                fadeOutAndRemoveCircle(circle);
                activeCircles.delete(id);
            }
        });

        approxThreats.forEach((threat) => {
            const posSig = `${threat.lat}|${threat.lon}|${threat.uncertaintyKm}`;
            const existing = activeCircles.get(threat.id);
            if (existing) {
                const moved = existing._posSig !== posSig;
                if (moved) {
                    existing._posSig = posSig;
                    existing.setLatLng([threat.lat, threat.lon]);
                    existing.setRadius(threat.uncertaintyKm * 1000);
                }
                if ((moved || isZoomEvent) && !isExtrapolation) {
                    drawCircleStroke(existing, CIRCLE_REDRAW_DELAY_MS);
                }
                return;
            }

            const circle = L.circle([threat.lat, threat.lon], {
                pane: UNCERTAINTY_PANE,
                radius: threat.uncertaintyKm * 1000,
                color: UNCERTAINTY_CIRCLE_COLOR,
                weight: 0.5,
                opacity: 0.85,
                dashArray: '4 5',
                fill: false,
                interactive: false,
                className: 'threat-uncertainty-circle',
            }).addTo(circlesGroup);
            circle._posSig = posSig;
            activeCircles.set(threat.id, circle);
            drawCircleStroke(circle, CIRCLE_DRAW_DELAY_MS);
        });

        const areaIds = new Set(areaThreats.map((t) => t.id));
        activeAreas.forEach((entry, id) => {
            if (!areaIds.has(id)) {
                fadeOutAndRemoveCircle(entry.ring);
                circlesGroup.removeLayer(entry.hit);
                activeAreas.delete(id);
                if (selectedThreatId === id) clearSelectedThreat();
            }
        });

        areaThreats.forEach((threat) => {
            const radiusM = (typeof threat.uncertaintyKm === 'number' ? threat.uncertaintyKm : AREA_ONLY_DEFAULT_KM) * 1000;
            const color = TYPE_ICONS[resolveTypeKey(threat)].color;
            const info = tooltipContent(threat, strings, isEnglish);
            const center = [threat.lat, threat.lon];
            const existing = activeAreas.get(threat.id);
            if (existing) {
                existing.ring.setLatLng(center).setRadius(radiusM).setStyle({ color, fillColor: color });
                existing.hit.setLatLng(center).setRadius(radiusM);
                existing.info = info;
                if (existing.hit.getTooltip()) existing.hit.setTooltipContent(info);
                if (selectHandler && selectedThreatId === threat.id) selectHandler(info, center, true);
                return;
            }

            const ring = L.circle(center, {
                pane: UNCERTAINTY_PANE,
                radius: radiusM,
                color,
                weight: 1.6,
                opacity: 0.9,
                dashArray: '7 5',
                fillColor: color,
                fillOpacity: 0.1,
                interactive: false,
                className: 'threat-area-ring',
            }).addTo(circlesGroup);
            const hit = L.circle(center, {
                pane: UNCERTAINTY_PANE,
                radius: radiusM,
                weight: AREA_HIT_WEIGHT_PX,
                opacity: 0,
                fill: false,
                interactive: true,
                bubblingMouseEvents: false,
                className: 'threat-area-hit',
            }).addTo(circlesGroup);
            const entry = { ring, hit, info };
            if (selectHandler) {
                hit.on('click', () => {
                    selectedThreatId = threat.id;
                    selectHandler(entry.info, center);
                });
            } else {
                hit.bindTooltip(info, { sticky: true });
            }
            activeAreas.set(threat.id, entry);
            drawCircleStroke(ring, CIRCLE_DRAW_DELAY_MS);
        });

        const singleIds = new Set(singles.map((t) => t.id));
        activeMarkers.forEach((marker, id) => {
            if (singleIds.has(id)) return;
            activeMarkers.delete(id);
            if (!currentIdsAll.has(id)) {
                fadeOutAndRemove(marker);
                if (selectedThreatId === id) clearSelectedThreat();
                if (!isExtrapolation) driftById.delete(id);
            } else {
                fadeOutAndRemove(marker, false);
            }
        });

        const clusterSeedIds = new Set(clusterGroups.map((members) => members[0].threat.id));
        activeClusters.forEach((marker, id) => {
            if (clusterSeedIds.has(id)) return;
            activeClusters.delete(id);
            fadeOutAndRemove(marker, false);
        });

        clusterGroups.forEach((members) => {
            const threatsIn = members.map((m) => m.threat);
            const seedId = threatsIn[0].id;
            const lat = threatsIn.reduce((sum, t) => sum + t.lat, 0) / threatsIn.length;
            const lon = threatsIn.reduce((sum, t) => sum + t.lon, 0) / threatsIn.length;
            const typeKey = dominantTypeKey(threatsIn);
            const allUncertain = threatsIn.every((t) => t.lifecycle === 'uncertain');
            const sig = `${typeKey}|${allUncertain}|${threatsIn.length}|${sizeMultiplier}`;
            const info = clusterTooltipContent(threatsIn, strings, splitZoom(threatsIn, sizeMultiplier) !== null);
            let marker = activeClusters.get(seedId);

            if (marker) {
                const el = marker.getElement();
                if (el) el.style.transition = `opacity ${MARKER_FADE_MS}ms ease, transform ${MOVE_DURATION_MS}ms ease`;
                marker.setLatLng([lat, lon]);
                if (marker._sig !== sig) {
                    animateIconSwap(marker, () => clusterIcon(threatsIn.length, typeKey, allUncertain, sizeMultiplier));
                    marker._sig = sig;
                }
                if (marker.getTooltip()) marker.setTooltipContent(info);
            } else {
                marker = L.marker([lat, lon], {
                    icon: clusterIcon(threatsIn.length, typeKey, allUncertain, sizeMultiplier),
                    pane: THREATS_PANE,
                    zIndexOffset: 1000,
                });
                marker._sig = sig;
                marker.on('click', () => zoomIntoCluster(marker));
                if (!selectHandler) marker.bindTooltip(info);
                marker.addTo(layer);
                activeClusters.set(seedId, marker);
                fadeInMarker(marker);
            }
            marker._members = threatsIn;
            marker._info = info;
            marker._seedId = seedId;
        });

        singles.forEach((threat) => {
            const latlng = spreadPos.get(threat.id) || [threat.lat, threat.lon];
            const existing = activeMarkers.get(threat.id);
            const typeSig = `${resolveTypeKey(threat)}|${threat.lifecycle}|${sizeMultiplier}`;

            if (existing) {
                const el = existing.getElement();
                if (el) {
                    const moveDuration = randomDuration(MOVE_DURATION_MS, MOVE_SPREAD_MS);
                    el.style.transition = `opacity ${randomDuration(MARKER_FADE_MS, MARKER_FADE_SPREAD_MS)}ms ease, transform ${moveDuration}ms ease`;
                }
                existing.setLatLng(latlng);
                existing._truePos = [threat.lat, threat.lon];
                if (existing._typeSig !== typeSig) {
                    animateIconSwap(
                        existing,
                        () => threatIcon(threat, sizeMultiplier),
                        () => {
                            existing._headingDeg = typeof threat.heading === 'number' ? threat.heading : undefined;
                        }
                    );
                    existing._typeSig = typeSig;
                } else {
                    applyIconRotation(existing, threat, true);
                }
                const info = tooltipContent(threat, strings, isEnglish);
                if (selectHandler) {
                    if (selectedThreatId === threat.id) selectHandler(info, existing._truePos, true);
                } else {
                    existing.setTooltipContent(info);
                }
                return;
            }

            const info = tooltipContent(threat, strings, isEnglish);
            const marker = L.marker(latlng, { icon: threatIcon(threat, sizeMultiplier), pane: THREATS_PANE });
            if (selectHandler) {
                marker.on('click', () => {
                    selectedThreatId = threat.id;
                    const cityZoom = kyivMode ? KYIV_THREAT_CLICK_ZOOM : RAION_MIN_ZOOM;
                    const targetZoom = Math.min(Math.max(map.getZoom(), cityZoom), map.getMaxZoom());
                    let shown = false;
                    const showCard = () => {
                        if (shown || selectedThreatId !== threat.id) return;
                        shown = true;
                        selectHandler(tooltipContent(threat, strings, isEnglish), marker._truePos);
                    };
                    if (kyivMode && !isInsideKyiv(marker._truePos)) {
                        showCard();
                        return;
                    }
                    map.once('moveend', showCard);
                    setTimeout(showCard, 1200);
                    hideDuringMove(marker._truePos, targetZoom);
                    map.flyTo(marker._truePos, targetZoom, { animate: true, duration: 0.8 });
                });
            } else {
                marker
                    .bindTooltip(info)
                    .on('mouseover', () => map.closePopup())
                    .on('click', () => {
                        if (kyivMode && !isInsideKyiv(marker._truePos)) return;
                        const cityZoom = kyivMode ? KYIV_THREAT_CLICK_ZOOM : RAION_MIN_ZOOM;
                        const targetZoom = Math.min(Math.max(map.getZoom(), cityZoom), map.getMaxZoom());
                        marker.closeTooltip();
                        hideDuringMove(marker._truePos, targetZoom);
                        map.flyTo(marker._truePos, targetZoom, { animate: true, duration: 0.8 });
                    });
            }
            marker.addTo(layer);
            marker._typeSig = typeSig;
            marker._headingDeg = typeof threat.heading === 'number' ? threat.heading : undefined;
            marker._truePos = [threat.lat, threat.lon];
            activeMarkers.set(threat.id, marker);
            fadeInMarker(marker);
        });
    }

    map.on('zoomend', () => renderThreats(lastThreats, { isZoomEvent: true }));

    layer.setKyivMode = function (active) {
        if (kyivMode === active) return;
        kyivMode = active;
        renderThreats(lastThreats);
    };

    layer.legendLayer = legendLayer;
    layer.hintLayer = hintLayer;

    window.alertServerLiveMap.getThreats().then((threats) => renderThreats(threats));
    window.alertServerLiveMap.onThreatsUpdated((threats) => renderThreats(threats));

    setInterval(() => renderThreats(extrapolatedThreats(), { isExtrapolation: true }), EXTRAPOLATION_TICK_MS);

    return layer;
}

export { startNeptunLayer };

const THREATS_URL = 'https://neptun.in.ua/api/v1/threats';
const STREAM_URL = 'wss://neptun.in.ua/api/v1/stream';
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 30000;

const MISSILE_TYPE_ALIASES = ['missile', 'rocket', 'cruise_missile', 'ballistic'];
const RECON_TITLE_PATTERN = /розвід/i;

// Simple, recognizable silhouettes (nose/front pointing up = 0 deg = north, so rotating the
// wrapper by `heading` degrees points the icon the right way) rather than abstract dots, one per
// threat category. "unknown" reuses the same triangle-and-exclamation the tray icon already uses,
// so an unrecognized type still reads as "alert" rather than looking broken.
// uav (kamikaze/attack, Shahed-style) is a tailless delta/flying wing; uav_recon (reconnaissance,
// e.g. Orlan/Zala-style) is a conventional fixed-wing silhouette with a separate tail - the shape
// difference mirrors the real distinction between the two drone families, not just a color swap.
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
            '<path d="M12 1 L13 11 L22 15 L22 16.5 L13 14 L13.5 20.5 L16.5 22.5 L16.5 23.5 L12 22.3 ' +
            'L7.5 23.5 L7.5 22.5 L10.5 20.5 L11 14 L2 16.5 L2 15 L11 11 Z" />',
    },
    fpv: {
        color: '#ff6b35',
        svg:
            '<line x1="12" y1="12" x2="7" y2="7" stroke="currentColor" stroke-width="2.4" />' +
            '<line x1="12" y1="12" x2="17" y2="7" stroke="currentColor" stroke-width="2.4" />' +
            '<line x1="12" y1="12" x2="7" y2="17" stroke="currentColor" stroke-width="2.4" />' +
            '<line x1="12" y1="12" x2="17" y2="17" stroke="currentColor" stroke-width="2.4" />' +
            '<circle cx="7" cy="7" r="3.4" /><circle cx="17" cy="7" r="3.4" />' +
            '<circle cx="7" cy="17" r="3.4" /><circle cx="17" cy="17" r="3.4" />' +
            '<circle cx="12" cy="12" r="2.6" />',
    },
    kab: {
        color: '#dc2626',
        svg: '<ellipse cx="12" cy="9" rx="4.2" ry="7.5" /><polygon points="7.5,16 3,22 8.5,18.5" /><polygon points="16.5,16 21,22 15.5,18.5" />',
    },
    missile: {
        color: '#991b1b',
        svg: '<polygon points="12,1 15,9 15,20 9,20 9,9" /><polygon points="9,15.5 4,22 9,19.5" /><polygon points="15,15.5 20,22 15,19.5" />',
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
    // The real API sends reconnaissance drones as type "recon" (not "uav"), which isn't a key in
    // TYPE_ICONS itself - without this check they fell through to "unknown" every time. The title
    // regex stays as a fallback for a "uav"-typed threat whose text says otherwise.
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

function iconHtml(typeKey, rotationDeg) {
    const { color, svg } = TYPE_ICONS[typeKey];
    const rotation = typeof rotationDeg === 'number' ? `transform: rotate(${rotationDeg}deg);` : '';
    return (
        `<div class="threat-icon" style="color: ${color}; ${rotation}">` +
        `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="#ffffff" stroke-width="1">${svg}</svg>` +
        `</div>`
    );
}

function threatIcon(threat) {
    const typeKey = resolveTypeKey(threat);
    const rotation = typeof threat.heading === 'number' ? threat.heading : undefined;

    return L.divIcon({
        className: 'threat-icon-wrapper',
        html: iconHtml(typeKey, rotation),
        iconSize: [22, 22],
        iconAnchor: [11, 11],
    });
}

function confidenceLabel(threat, strings) {
    const key = `liveMapConfidence${(threat.displayConfidence || threat.confidenceLevel || '').replace(/^(.)/, (m) => m.toUpperCase())}`;
    return strings[key] || threat.displayConfidence || threat.confidenceLevel || '';
}

function tooltipContent(threat, strings) {
    const updatedTime = threat.updatedAt ? new Date(threat.updatedAt).toLocaleTimeString() : '';
    const lines = [
        `<strong>${escapeHtml(threat.title)}</strong>`,
        escapeHtml(threat.explanationShort || [threat.locality, threat.region].filter(Boolean).join(', ')),
        `<small>${escapeHtml(confidenceLabel(threat, strings))}${updatedTime ? ` · ${strings.liveMapUpdated}: ${updatedTime}` : ''}</small>`,
    ];
    return lines.filter(Boolean).join('<br>');
}

function buildLegend(strings) {
    const rows = ['uav', 'uav_recon', 'fpv', 'kab', 'missile', 'unknown']
        .map((typeKey) => `<div class="legend-row">${iconHtml(typeKey)}<span>${escapeHtml(strings[`liveMapType_${typeKey}`])}</span></div>`)
        .join('');

    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = () => {
        const container = L.DomUtil.create('div', 'threat-legend');
        container.innerHTML = `<div class="legend-title">${escapeHtml(strings.liveMapLegendTitle)}</div>${rows}`;
        return container;
    };
    return legend;
}

function startNeptunLayer(map, strings) {
    const layer = L.layerGroup().addTo(map);
    let reconnectTimer = null;
    let heartbeatTimer = null;

    buildLegend(strings).addTo(map);

    function renderThreats(threats) {
        layer.clearLayers();
        if (!Array.isArray(threats)) return;

        threats.forEach((threat) => {
            if (typeof threat.lat !== 'number' || typeof threat.lon !== 'number') return;
            L.marker([threat.lat, threat.lon], { icon: threatIcon(threat) })
                .bindTooltip(tooltipContent(threat, strings))
                .addTo(layer);
        });
    }

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
                // 'alerts' and 'heartbeat' message types are not used by this layer.
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

    return layer;
}

export { startNeptunLayer };

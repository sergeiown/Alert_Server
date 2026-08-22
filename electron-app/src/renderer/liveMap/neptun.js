const THREATS_URL = 'https://neptun.in.ua/api/v1/threats';
const STREAM_URL = 'wss://neptun.in.ua/api/v1/stream';
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 30000;

const TYPE_COLORS = {
    uav: '#f5a623',
    fpv: '#ff6b35',
    kab: '#dc2626',
};
const DEFAULT_TYPE_COLOR = '#991b1b';

function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function threatIcon(threat) {
    const color = TYPE_COLORS[threat.type] || DEFAULT_TYPE_COLOR;
    const hasHeading = typeof threat.heading === 'number';
    const rotation = hasHeading ? `transform: rotate(${threat.heading}deg);` : '';
    const arrow = hasHeading
        ? `<div class="threat-arrow" style="border-bottom-color: ${color};"></div>`
        : '';

    return L.divIcon({
        className: 'threat-icon-wrapper',
        html: `<div class="threat-icon" style="${rotation}">${arrow}<div class="threat-core" style="background: ${color};"></div></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
    });
}

function confidenceLabel(threat, strings) {
    const key = `liveMapConfidence${(threat.displayConfidence || threat.confidenceLevel || '').replace(/^(.)/, (m) => m.toUpperCase())}`;
    return strings[key] || threat.displayConfidence || threat.confidenceLevel || '';
}

function popupContent(threat, strings) {
    const updatedTime = threat.updatedAt ? new Date(threat.updatedAt).toLocaleTimeString() : '';
    const lines = [
        `<strong>${escapeHtml(threat.title)}</strong>`,
        escapeHtml(threat.explanationShort || [threat.locality, threat.region].filter(Boolean).join(', ')),
        `<small>${escapeHtml(confidenceLabel(threat, strings))}${updatedTime ? ` · ${strings.liveMapUpdated}: ${updatedTime}` : ''}</small>`,
    ];
    return lines.filter(Boolean).join('<br>');
}

function startNeptunLayer(map, strings) {
    const layer = L.layerGroup().addTo(map);
    let reconnectTimer = null;
    let heartbeatTimer = null;

    function renderThreats(threats) {
        layer.clearLayers();
        if (!Array.isArray(threats)) return;

        threats.forEach((threat) => {
            if (typeof threat.lat !== 'number' || typeof threat.lon !== 'number') return;
            L.marker([threat.lat, threat.lon], { icon: threatIcon(threat) })
                .bindPopup(popupContent(threat, strings))
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
}

export { startNeptunLayer };

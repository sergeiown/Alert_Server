// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { getLiveMapWindow } = require('../windows/liveMapWindow');
const dailyPeakStore = require('./dailyPeakStore');
const { loadLocalConfig } = require('./localConfig');
const { PROXY_URL, PROXY_WS_URL, getClientVersion } = require('./proxyConfig');

const THREATS_URL = 'https://neptun.in.ua/api/v1/threats';
const STREAM_URL = 'wss://neptun.in.ua/api/v1/stream';
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60000;
const PROXY_RETRY_AFTER_MS = 10 * 60 * 1000;
const HEARTBEAT_TIMEOUT_MS = 120000;
const SNAPSHOT_REFRESH_MS = 60000;
const PUBLISH_DEBOUNCE_MS = 500;
const LOG_MIN_INTERVAL_MS = 60000;

let latestThreats = [];
let threatsById = new Map();
let socket = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let fallbackTimer = null;
let usingFallback = false;
let publishDebounceTimer = null;
let lastLoggedAt = 0;
let logCatchupTimer = null;
let useProxy = true;
let directSince = 0;
let gotMessage = false;
let reconnectAttempts = 0;

function getClientKey() {
    try {
        return loadLocalConfig().alertProxyClientKey || '';
    } catch (err) {
        return '';
    }
}

function proxyEnabled() {
    if (!useProxy && Date.now() - directSince > PROXY_RETRY_AFTER_MS) useProxy = true;
    return useProxy && Boolean(getClientKey());
}

function scheduleReconnect() {
    const delay = Math.min(RECONNECT_DELAY_MS * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(connect, delay);
}

function getLatestThreats() {
    return latestThreats;
}

function publishThreats(threats) {
    latestThreats = Array.isArray(threats) ? threats : [];
    dailyPeakStore.recordThreatCount(latestThreats.length);
    const win = getLiveMapWindow();
    if (win) win.webContents.send('liveMap:threatsUpdated', latestThreats);
}

function applySnapshot(threats) {
    threatsById = new Map((threats || []).filter((t) => t && t.id).map((t) => [t.id, t]));
}

function applyUpsert(threat) {
    if (threat && threat.id) threatsById.set(threat.id, threat);
}

function applyRemove(id) {
    if (id) threatsById.delete(id);
}

function logCurrentCount() {
    lastLoggedAt = Date.now();
    logEvent(`Update (Neptun threats): ${threatsById.size} active threats`, 'NETWORK');
}

function maybeLogUpdate() {
    const elapsed = Date.now() - lastLoggedAt;
    if (elapsed >= LOG_MIN_INTERVAL_MS) {
        if (logCatchupTimer) {
            clearTimeout(logCatchupTimer);
            logCatchupTimer = null;
        }
        logCurrentCount();
        return;
    }

    if (logCatchupTimer) return;
    logCatchupTimer = setTimeout(() => {
        logCatchupTimer = null;
        logCurrentCount();
    }, LOG_MIN_INTERVAL_MS - elapsed);
}

function schedulePublish() {
    if (publishDebounceTimer) clearTimeout(publishDebounceTimer);
    publishDebounceTimer = setTimeout(() => {
        publishDebounceTimer = null;
        maybeLogUpdate();
        publishThreats(Array.from(threatsById.values()));
    }, PUBLISH_DEBOUNCE_MS);
}

async function fetchSnapshot() {
    try {
        const viaProxy = proxyEnabled();
        const response = viaProxy
            ? await fetch(`${PROXY_URL}/neptun/threats`, { headers: { 'X-Client-Key': getClientKey(), 'X-Client-Version': getClientVersion() } })
            : await fetch(THREATS_URL);
        if (!response.ok) {
            logEvent(`Neptun threats fallback fetch failed: ${response.status}`, 'NETWORK');
            return;
        }
        const data = await response.json();
        applySnapshot(data.threats);
        maybeLogUpdate();
        publishThreats(Array.from(threatsById.values()));
    } catch (err) {
        logEvent(`Neptun threats fallback request error: ${err.message}`, 'NETWORK');
    }
}

function startFallbackPolling() {
    if (usingFallback) return;
    usingFallback = true;
    logEvent('Neptun threats: unavailable - falling back to polling', 'NETWORK');
    fetchSnapshot();
    fallbackTimer = setInterval(fetchSnapshot, SNAPSHOT_REFRESH_MS);
}

function stopFallbackPolling() {
    if (!usingFallback) return;
    usingFallback = false;
    if (fallbackTimer) clearInterval(fallbackTimer);
    fallbackTimer = null;
    logEvent('Neptun threats: recovered - stopping fallback polling', 'NETWORK');
}

function resetHeartbeatWatch() {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
        logEvent('Neptun threats: no messages received - reconnecting', 'NETWORK');
        connect();
    }, HEARTBEAT_TIMEOUT_MS);
}

function connect() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (socket) {
        try {
            socket.close();
        } catch (err) {}
    }

    const viaProxy = proxyEnabled();
    gotMessage = false;
    let ws;
    try {
        ws = new WebSocket(
            viaProxy
                ? `${PROXY_WS_URL}/ws-neptun?key=${encodeURIComponent(getClientKey())}&v=${encodeURIComponent(getClientVersion())}`
                : STREAM_URL
        );
    } catch (err) {
        logEvent(`Neptun threats connection failed: ${err.message}`, 'NETWORK');
        if (viaProxy) {
            useProxy = false;
            directSince = Date.now();
        }
        scheduleReconnect();
        return;
    }
    socket = ws;

    ws.addEventListener('open', () => {
        logEvent(`Neptun threats connected${viaProxy ? ' (via alert-proxy)' : ' (direct)'}`, 'NETWORK');
        resetHeartbeatWatch();
    });

    ws.addEventListener('message', (event) => {
        gotMessage = true;
        reconnectAttempts = 0;
        resetHeartbeatWatch();
        let message;
        try {
            message = JSON.parse(event.data);
        } catch (err) {
            logEvent(`Neptun threats message parse failed: ${err.message}`, 'NETWORK');
            return;
        }

        switch (message.type) {
            case 'snapshot':
                stopFallbackPolling();
                applySnapshot(message.data?.threats);
                schedulePublish();
                break;
            case 'upsert':
                applyUpsert(message.data);
                schedulePublish();
                break;
            case 'remove':
                applyRemove(message.data?.id);
                schedulePublish();
                break;
            default:
                break;
        }
    });

    ws.addEventListener('close', (event) => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        if (socket !== ws) return;
        logEvent(`Neptun threats connection closed (code ${event.code}${event.reason ? `: ${event.reason}` : ''}) - reconnecting`, 'NETWORK');
        if (viaProxy && !gotMessage) {
            useProxy = false;
            directSince = Date.now();
            logEvent('Neptun threats: alert-proxy stream unavailable - switching to direct connection', 'NETWORK');
        }
        startFallbackPolling();
        scheduleReconnect();
    });

    ws.addEventListener('error', () => {});
}

function startNeptunThreatsTracking() {
    connect();
}

module.exports = { startNeptunThreatsTracking, getLatestThreats };

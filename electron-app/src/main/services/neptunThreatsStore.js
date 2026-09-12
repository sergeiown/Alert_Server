// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { getLiveMapWindow } = require('../windows/liveMapWindow');

const THREATS_URL = 'https://neptun.in.ua/api/v1/threats';
const STREAM_URL = 'wss://neptun.in.ua/api/v1/stream';
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 30000;
const SNAPSHOT_REFRESH_MS = 60000;
const PUBLISH_DEBOUNCE_MS = 500;

let latestThreats = [];
let threatsById = new Map();
let socket = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let fallbackTimer = null;
let usingFallback = false;
let publishDebounceTimer = null;

function getLatestThreats() {
    return latestThreats;
}

function publishThreats(threats) {
    latestThreats = Array.isArray(threats) ? threats : [];
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

function schedulePublish() {
    if (publishDebounceTimer) clearTimeout(publishDebounceTimer);
    publishDebounceTimer = setTimeout(() => {
        publishDebounceTimer = null;
        const threats = Array.from(threatsById.values());
        logEvent(`Neptun threats updated (stream): ${threats.length} active`, 'NETWORK');
        publishThreats(threats);
    }, PUBLISH_DEBOUNCE_MS);
}

async function fetchSnapshot() {
    try {
        const response = await fetch(THREATS_URL);
        if (!response.ok) {
            logEvent(`Neptun snapshot fetch failed: ${response.status}`, 'NETWORK');
            return;
        }
        const data = await response.json();
        applySnapshot(data.threats);
        logEvent(`Neptun threats updated (snapshot): ${threatsById.size} active`, 'NETWORK');
        publishThreats(Array.from(threatsById.values()));
    } catch (err) {
        logEvent(`Neptun snapshot fetch error: ${err.message}`, 'NETWORK');
    }
}

function startFallbackPolling() {
    if (usingFallback) return;
    usingFallback = true;
    logEvent('Neptun: stream unavailable, falling back to polling', 'NETWORK');
    fetchSnapshot();
    fallbackTimer = setInterval(fetchSnapshot, SNAPSHOT_REFRESH_MS);
}

function stopFallbackPolling() {
    if (!usingFallback) return;
    usingFallback = false;
    if (fallbackTimer) clearInterval(fallbackTimer);
    fallbackTimer = null;
    logEvent('Neptun: stream recovered, stopping fallback polling', 'NETWORK');
}

function resetHeartbeatWatch() {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
        logEvent('Neptun stream: no messages received, reconnecting', 'NETWORK');
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

    let ws;
    try {
        ws = new WebSocket(STREAM_URL);
    } catch (err) {
        logEvent(`Neptun stream connection failed: ${err.message}`, 'NETWORK');
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        return;
    }
    socket = ws;

    ws.addEventListener('open', () => {
        logEvent('Neptun stream connected', 'NETWORK');
        resetHeartbeatWatch();
    });

    ws.addEventListener('message', (event) => {
        resetHeartbeatWatch();
        let message;
        try {
            message = JSON.parse(event.data);
        } catch (err) {
            logEvent(`Neptun stream message parse failed: ${err.message}`, 'NETWORK');
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

    ws.addEventListener('close', () => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        if (socket !== ws) return;
        startFallbackPolling();
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    });

    ws.addEventListener('error', (event) => {
        logEvent(`Neptun stream error: ${event.message || 'unknown error'}`, 'NETWORK');
    });
}

function startNeptunThreatsTracking() {
    connect();
}

module.exports = { startNeptunThreatsTracking, getLatestThreats };

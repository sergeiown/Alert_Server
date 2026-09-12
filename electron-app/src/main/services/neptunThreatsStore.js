// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { getLiveMapWindow } = require('../windows/liveMapWindow');

const THREATS_URL = 'https://neptun.in.ua/api/v1/threats';
const STREAM_URL = 'wss://neptun.in.ua/api/v1/stream';
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 30000;
const SNAPSHOT_REFRESH_MS = 60000;

let latestThreats = [];
let socket = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let fallbackTimer = null;
let usingFallback = false;

function getLatestThreats() {
    return latestThreats;
}

function publishThreats(threats) {
    latestThreats = Array.isArray(threats) ? threats : [];
    const win = getLiveMapWindow();
    if (win) win.webContents.send('liveMap:threatsUpdated', latestThreats);
}

async function fetchSnapshot() {
    try {
        const response = await fetch(THREATS_URL);
        if (!response.ok) {
            logEvent(`Neptun snapshot fetch failed: ${response.status}`, 'NETWORK');
            return;
        }
        const data = await response.json();
        logEvent(`Neptun threats updated (snapshot): ${(data.threats || []).length} active`, 'NETWORK');
        publishThreats(data.threats);
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
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'snapshot') {
                stopFallbackPolling();
                logEvent(`Neptun threats updated (stream): ${(message.data?.threats || []).length} active`, 'NETWORK');
                publishThreats(message.data?.threats);
            }
        } catch (err) {
            logEvent(`Neptun stream message parse failed: ${err.message}`, 'NETWORK');
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

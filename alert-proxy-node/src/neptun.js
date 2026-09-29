// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const archive = require('./archive');
const trends = require('./trends');

const ALERTS_URL = 'https://neptun.in.ua/api/v1/alerts';
const THREATS_URL = 'https://neptun.in.ua/api/v1/threats';
const STREAM_URL = 'wss://neptun.in.ua/api/v1/stream';
const ALERTS_POLL_MS = 30 * 1000;
const SNAPSHOT_POLL_MS = 60 * 1000;
const RECONNECT_BASE_MS = 5 * 1000;
const RECONNECT_MAX_MS = 60 * 1000;
const HEARTBEAT_TIMEOUT_MS = 120 * 1000;

const sockets = new Set();
const threatsById = new Map();

const state = {
    alertsBody: null,
    alertsFetchedAt: 0,
    alertsCounts: null,
    alertsError: null,
    streamConnected: false,
    streamSince: 0,
    lastMessageAt: 0,
    reconnectAttempts: 0,
    snapshotFetchedAt: 0,
    snapshotError: null,
};

let stream = null;
let reconnectTimer = null;
let heartbeatTimer = null;

function log(message) {
    console.log(`[neptun] ${message}`);
}

function snapshotMessage() {
    return JSON.stringify({ type: 'snapshot', data: { threats: Array.from(threatsById.values()) } });
}

function broadcast(raw) {
    sockets.forEach((ws) => {
        try {
            ws.send(raw);
        } catch (err) {}
    });
}

function applySnapshot(threats) {
    const incoming = (threats || []).filter((t) => t && t.id);
    const incomingIds = new Set(incoming.map((t) => String(t.id)));
    const removedIds = [];
    threatsById.forEach((_, id) => {
        if (!incomingIds.has(String(id))) removedIds.push(id);
    });

    threatsById.clear();
    incoming.forEach((t) => threatsById.set(t.id, t));
    archive.recordThreats(incoming, removedIds);
    trends.recordThreatCount(threatsById.size);
}

function applyUpsert(threat) {
    if (!threat || !threat.id) return;
    threatsById.set(threat.id, threat);
    archive.recordThreats([threat], []);
    trends.recordThreatCount(threatsById.size);
}

function applyRemove(id) {
    if (!id) return;
    threatsById.delete(id);
    archive.recordThreats([], [id]);
}

function resetHeartbeatWatch() {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
        log('stream silent, reconnecting');
        connect();
    }, HEARTBEAT_TIMEOUT_MS);
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** state.reconnectAttempts, RECONNECT_MAX_MS);
    state.reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, delay);
}

function connect() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (stream) {
        const old = stream;
        stream = null;
        try {
            old.close();
        } catch (err) {}
    }

    let ws;
    try {
        ws = new WebSocket(STREAM_URL);
    } catch (err) {
        log(`connect failed: ${err.message}`);
        scheduleReconnect();
        return;
    }
    stream = ws;

    ws.addEventListener('open', () => {
        state.streamConnected = true;
        state.streamSince = Date.now();
        state.reconnectAttempts = 0;
        log('stream connected');
        resetHeartbeatWatch();
    });

    ws.addEventListener('message', (event) => {
        state.lastMessageAt = Date.now();
        resetHeartbeatWatch();

        let message;
        try {
            message = JSON.parse(event.data);
        } catch (err) {
            return;
        }

        try {
            if (message.type === 'snapshot') {
                applySnapshot(message.data && message.data.threats);
                broadcast(snapshotMessage());
            } else if (message.type === 'upsert') {
                applyUpsert(message.data);
                broadcast(String(event.data));
            } else if (message.type === 'remove') {
                applyRemove(message.data && message.data.id);
                broadcast(String(event.data));
            }
        } catch (err) {
            console.error('[neptun] message handling failed', err && err.stack ? err.stack : err);
        }
    });

    ws.addEventListener('close', () => {
        if (stream !== ws) return;
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        state.streamConnected = false;
        log('stream closed');
        scheduleReconnect();
    });

    ws.addEventListener('error', () => {});
}

async function pollSnapshot() {
    if (state.streamConnected) return;
    try {
        const response = await fetch(THREATS_URL);
        if (!response.ok) {
            state.snapshotError = { status: response.status };
            return;
        }
        const data = await response.json();
        applySnapshot(data.threats);
        broadcast(snapshotMessage());
        state.snapshotFetchedAt = Date.now();
        state.snapshotError = null;
    } catch (err) {
        state.snapshotError = { status: 0, message: err.message };
    }
}

async function pollAlerts() {
    try {
        const response = await fetch(ALERTS_URL);
        if (!response.ok) {
            state.alertsError = { status: response.status };
            return;
        }
        const body = await response.text();
        const parsed = JSON.parse(body);
        state.alertsBody = body;
        state.alertsFetchedAt = Date.now();
        state.alertsCounts = {
            oblasts: Array.isArray(parsed.oblasts) ? parsed.oblasts.length : 0,
            raions: Array.isArray(parsed.raions) ? parsed.raions.length : 0,
        };
        state.alertsError = null;
    } catch (err) {
        state.alertsError = { status: 0, message: err.message };
    }
}

function loop(fn, intervalMs) {
    const run = async () => {
        try {
            await fn();
        } finally {
            setTimeout(run, intervalMs);
        }
    };
    run();
}

function start() {
    connect();
    loop(pollAlerts, ALERTS_POLL_MS);
    loop(pollSnapshot, SNAPSHOT_POLL_MS);
}

function acceptSocket(ws) {
    sockets.add(ws);
    try {
        ws.send(snapshotMessage());
    } catch (err) {}
}

function unregisterSocket(ws) {
    sockets.delete(ws);
}

function getAlertsResponse() {
    if (!state.alertsBody) {
        return {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: state.alertsError || { status: 0, message: 'no data yet' } }),
        };
    }
    return { status: 200, headers: { 'Content-Type': 'application/json' }, body: state.alertsBody };
}

function getThreatsResponse() {
    return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threats: Array.from(threatsById.values()) }),
    };
}

function getStatusInfo() {
    const now = Date.now();
    return {
        stream: {
            connected: state.streamConnected,
            connectedForMs: state.streamConnected ? now - state.streamSince : null,
            lastMessageAgeMs: state.lastMessageAt ? now - state.lastMessageAt : null,
            reconnectAttempts: state.reconnectAttempts,
        },
        threats: { active: threatsById.size, snapshotError: state.snapshotError },
        alerts: {
            cacheAgeMs: state.alertsFetchedAt ? now - state.alertsFetchedAt : null,
            counts: state.alertsCounts,
            currentError: state.alertsError,
        },
        clients: sockets.size,
    };
}

module.exports = {
    start,
    acceptSocket,
    unregisterSocket,
    socketCount: () => sockets.size,
    getAlertsResponse,
    getThreatsResponse,
    getStatusInfo,
};

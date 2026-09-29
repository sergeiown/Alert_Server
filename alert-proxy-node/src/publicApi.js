// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const config = require('./config');
const gateway = require('./gateway');
const neptun = require('./neptun');
const occupied = require('./occupied');
const trends = require('./trends');
const regions = require('./regions');
const ratelimit = require('./ratelimit');

const STALE_AFTER_MS = 120 * 1000;
const TICK_MS = 2000;
const HEARTBEAT_MS = 25 * 1000;

const sockets = new Set();
let memo = { body: null, total: 0, regions: { oblasts: [], raions: [], kyivRaions: [] } };
let lastStateKey = '';
let lastThreatsBody = '';
let lastHeartbeatAt = 0;

function regionsFor(body) {
    if (memo.body === body) return memo;

    let alerts = [];
    try {
        alerts = JSON.parse(body).alerts || [];
    } catch (err) {}

    const aggregated = regions.computeAlertedRegions(alerts);
    memo = {
        body,
        total: alerts.length,
        regions: { ...aggregated, kyivRaions: regions.computeKyivRaionStatuses(alerts) },
    };
    return memo;
}

function buildState() {
    const snapshot = gateway.getActiveBody();
    const now = Date.now();
    const parsed = snapshot.body ? regionsFor(snapshot.body) : { total: 0, regions: { oblasts: [], raions: [], kyivRaions: [] } };
    const dataAgeMs = snapshot.fetchedAt ? now - snapshot.fetchedAt : null;

    return {
        generatedAt: new Date(now).toISOString(),
        source: 'alerts.in.ua',
        dataAgeMs,
        stale: dataAgeMs === null || dataAgeMs > STALE_AFTER_MS,
        total: parsed.total,
        regions: parsed.regions,
        peaks: trends.getDailyPeaks(),
        features: { threats: config.PUBLIC_THREATS_ENABLED, occupied: config.PUBLIC_OCCUPIED_ENABLED },
    };
}

function stateKey(state) {
    return JSON.stringify([state.total, state.regions, state.peaks, state.stale, state.features]);
}

function jsonResult(status, payload, maxAgeSeconds) {
    return {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${maxAgeSeconds}`,
            'X-Content-Type-Options': 'nosniff',
        },
        body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    };
}

function disabled() {
    return jsonResult(404, { error: 'disabled' }, 30);
}

function handle(pathname) {
    if (pathname === '/public/state') return jsonResult(200, buildState(), 4);

    if (pathname === '/public/threats') {
        if (!config.PUBLIC_THREATS_ENABLED) return disabled();
        const threats = neptun.getThreatsResponse();
        return jsonResult(200, threats.body, 3);
    }

    if (pathname === '/public/occupied') {
        if (!config.PUBLIC_OCCUPIED_ENABLED) return disabled();
        const result = occupied.getResponse();
        return { ...result, headers: { ...result.headers, 'X-Content-Type-Options': 'nosniff' } };
    }

    return null;
}

function sendMessage(ws, message) {
    try {
        ws.send(JSON.stringify(message));
    } catch (err) {}
}

function broadcast(message) {
    const raw = JSON.stringify(message);
    sockets.forEach((ws) => {
        try {
            ws.send(raw);
        } catch (err) {}
    });
}

function threatsPayload() {
    return JSON.parse(neptun.getThreatsResponse().body);
}

function acceptSocket(ws) {
    sockets.add(ws);
    sendMessage(ws, { type: 'state', data: buildState() });
    if (config.PUBLIC_THREATS_ENABLED) sendMessage(ws, { type: 'threats', data: threatsPayload() });
}

function unregisterSocket(ws) {
    sockets.delete(ws);
}

function canAcceptSocket() {
    return sockets.size < config.PUBLIC_WS_MAX;
}

function originAllowed(origin) {
    return !origin || origin === config.PUBLIC_ORIGIN;
}

function tick() {
    if (!sockets.size) return;

    const state = buildState();
    const key = stateKey(state);
    if (key !== lastStateKey) {
        lastStateKey = key;
        broadcast({ type: 'state', data: state });
    }

    if (config.PUBLIC_THREATS_ENABLED) {
        const body = neptun.getThreatsResponse().body;
        if (body !== lastThreatsBody) {
            lastThreatsBody = body;
            broadcast({ type: 'threats', data: JSON.parse(body) });
        }
    }

    const now = Date.now();
    if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
        lastHeartbeatAt = now;
        broadcast({ type: 'ping', dataAgeMs: state.dataAgeMs, stale: state.stale });
    }
}

function start() {
    setInterval(tick, TICK_MS).unref();
}

function getStatusInfo() {
    return {
        enabled: config.PUBLIC_API_ENABLED,
        threatsEnabled: config.PUBLIC_THREATS_ENABLED,
        occupiedEnabled: config.PUBLIC_OCCUPIED_ENABLED,
        webSockets: sockets.size,
        maxWebSockets: config.PUBLIC_WS_MAX,
        allowedOrigin: config.PUBLIC_ORIGIN,
    };
}

module.exports = { handle, start, acceptSocket, unregisterSocket, canAcceptSocket, originAllowed, getStatusInfo };

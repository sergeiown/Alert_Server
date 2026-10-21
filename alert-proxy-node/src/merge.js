// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const gateway = require('./gateway');
const neptun = require('./neptun');
const store = require('./store');
const { loadConfig, buildDirectory, createMerger, signatureOf } = require('./mergeCore');
const tree = require('../resources/locations.json');

const TICK_MS = 1000;
const MIN_SEND_GAP_MS = 2000;
const HEARTBEAT_MS = 60 * 1000;
const IA_ONLY_TRIGGER_MS = 60 * 1000;
const CURRENT_MAX_AGE_MS = 1500;

const cfg = loadConfig();
const directory = buildDirectory(tree);
const merger = createMerger({ cfg, directory, log: (message) => console.warn(`[merge] ${message}`) });

const cache = { iaBody: null, iaAlerts: [], npBody: null, npPayload: null };

let current = null;
let everReady = false;
let lastSentSignature = null;
let lastSentAt = 0;
let lastHeartbeatAt = 0;
let started = false;

const iaOnlySince = new Map();
const lastTriggerAt = new Map();
const TRIGGER_COOLDOWN_MS = 10 * 60 * 1000;

function readIa() {
    const { body, fetchedAt } = gateway.getActiveBody();
    if (!body) return { alerts: [], fetchedAt: null };
    if (body !== cache.iaBody) {
        cache.iaBody = body;
        try {
            cache.iaAlerts = JSON.parse(body).alerts || [];
        } catch (err) {
            cache.iaAlerts = [];
        }
    }
    return { alerts: cache.iaAlerts, fetchedAt };
}

function readUa() {
    let saved = null;
    try {
        saved = store.get('ukraineAlarmState');
    } catch (err) {
        saved = null;
    }
    if (!saved) return { regions: [], fetchedAt: null };
    return { regions: saved.latestAlerts || [], fetchedAt: saved.lastFullFetchAt || null };
}

function readNp() {
    const { body, fetchedAt } = neptun.getAlertsSnapshot();
    if (!body) return { payload: null, fetchedAt: null };
    if (body !== cache.npBody) {
        cache.npBody = body;
        try {
            cache.npPayload = JSON.parse(body);
        } catch (err) {
            cache.npPayload = null;
        }
    }
    return { payload: cache.npPayload, fetchedAt };
}

function buildBody(result, now) {
    return {
        alerts: result.alerts,
        sources: result.sources,
        degraded: result.degraded,
        neptunOnly: result.neptunOnly,
        officialCount: result.officialCount,
        generatedAt: new Date(now).toISOString(),
    };
}

function heartbeatMessage(result) {
    return JSON.stringify({ type: 'heartbeat', sources: result.sources, degraded: result.degraded });
}

function sendToAll(message) {
    gateway.forEachSocket('merged', (ws) => {
        try {
            ws.send(message);
        } catch (err) {}
    });
}

function triggerSnapshots(now, result) {
    const keys = new Set(result.iaOnlyKeys);
    [...iaOnlySince.keys()].forEach((key) => {
        if (!keys.has(key)) iaOnlySince.delete(key);
    });
    lastTriggerAt.forEach((at, key) => {
        if (now - at > TRIGGER_COOLDOWN_MS) lastTriggerAt.delete(key);
    });
    keys.forEach((key) => {
        if (!iaOnlySince.has(key)) iaOnlySince.set(key, now);
    });

    for (const [key, since] of iaOnlySince) {
        if (lastTriggerAt.has(key) || now - since < IA_ONLY_TRIGGER_MS) continue;
        if (!gateway.requestUkraineAlarmSnapshot()) break;
        lastTriggerAt.set(key, now);
        console.log(`[merge] alert ${key} seen by alerts.in.ua but not by UkraineAlarm for over a minute, snapshot requested`);
    }
}

function compute(now) {
    const result = merger.update(now, { ia: readIa(), ua: readUa(), np: readNp(), webhook: gateway.getUkraineAlarmWebhookHealth().state });
    current = { result, signature: signatureOf(result), at: now };
    if (result.ready) everReady = true;
    return current;
}

function broadcastIfNeeded(now) {
    if (!everReady) return;
    const { result, signature } = current;

    if (signature !== lastSentSignature) {
        if (now - lastSentAt < MIN_SEND_GAP_MS) return;
        lastSentSignature = signature;
        lastSentAt = now;
        lastHeartbeatAt = now;
        sendToAll(JSON.stringify(buildBody(result, now)));
        return;
    }

    if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
        lastHeartbeatAt = now;
        sendToAll(heartbeatMessage(result));
    }
}

function tick() {
    const now = Date.now();
    try {
        compute(now);
        triggerSnapshots(now, current.result);
        broadcastIfNeeded(now);
    } catch (err) {
        console.error('[merge]', err && err.stack ? err.stack : err);
    }
}

function start() {
    if (started) return;
    started = true;
    tick();
    setInterval(tick, TICK_MS).unref();
}

function currentFresh() {
    const now = Date.now();
    if (!current || now - current.at > CURRENT_MAX_AGE_MS) compute(now);
    return current;
}

function acceptSocket(ws) {
    gateway.registerSocket('merged', ws);
    if (!everReady) return;
    try {
        const { result } = currentFresh();
        ws.send(JSON.stringify(buildBody(result, Date.now())));
    } catch (err) {}
}

function getResponse() {
    const { result } = currentFresh();
    if (!everReady) {
        return {
            status: 503,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ error: 'alert sources are not ready yet', sources: result.sources }),
        };
    }
    return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify(buildBody(result, Date.now())),
    };
}

function getCurrentAlerts() {
    if (!everReady) return null;
    const { result } = currentFresh();
    return { alerts: result.alerts, officialCount: result.officialCount, sources: result.sources };
}

function getStatusInfo() {
    if (!current) return { ready: false, sources: null, degraded: null, alertCount: 0, officialCount: 0, neptunConfirmedCount: 0, neptunOnlyCount: 0, sockets: gateway.socketCount('merged') };
    const { result } = current;
    return {
        ready: everReady,
        sources: result.sources,
        degraded: result.degraded,
        alertCount: result.alerts.length,
        neptunConfirmedCount: result.alerts.filter((alert) => alert.sources.includes('np')).length,
        officialCount: result.officialCount,
        neptunOnlyCount: result.neptunOnly.length,
        lastBroadcastAgeMs: lastSentAt ? Date.now() - lastSentAt : null,
        sockets: gateway.socketCount('merged'),
    };
}

module.exports = { start, acceptSocket, getResponse, getCurrentAlerts, getStatusInfo, socketCount: () => gateway.socketCount('merged') };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');
const { logEvent } = require('./logger');
const { setLatestAlertData, getLatestAlertData } = require('./activeAlertData');

const WS_URL = 'wss://alert-proxy.alert-proxy-ua.workers.dev/ws-alerts-in-ua';
const FALLBACK_POLL_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 8 * 60 * 1000;
const FALLBACK_POLL_INTERVAL_MS = 30000;
const ORIGIN_ISSUE_LOG_COOLDOWN_MS = 30 * 60 * 1000;

let lastLoggedStatus = null;
let lastLoggedAt = 0;

function describeOriginStatus(status) {
    if (status === 401) return 'token invalid, revoked, or expired';
    if (status === 403) return 'IP blocked or country unavailable';
    if (status === 429) return 'rate limit exceeded';
    return `unexpected status ${status}`;
}

function logOriginIssue(status) {
    const now = Date.now();
    if (status === lastLoggedStatus && now - lastLoggedAt < ORIGIN_ISSUE_LOG_COOLDOWN_MS) return;
    lastLoggedStatus = status;
    lastLoggedAt = now;
    logEvent(`alert-proxy origin issue (alerts.in.ua): ${status} (${describeOriginStatus(status)})`, 'NETWORK');
}

function noteOriginHealthy() {
    if (lastLoggedStatus === null) return;
    logEvent('alert-proxy origin recovered (alerts.in.ua)', 'NETWORK');
    lastLoggedStatus = null;
}

function persistData(data) {
    setLatestAlertData(data);
    fs.writeFileSync(getUserDataFile('alert_received.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function startPolling(clientKey, onUpdate, onHealthChange) {
    let socket = null;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let fallbackTimer = null;
    let stopped = false;
    let usingFallback = false;

    function resetHeartbeatWatch() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
            logEvent('alert-proxy (alerts.in.ua) WebSocket: no messages received, reconnecting', 'NETWORK');
            connect();
        }, HEARTBEAT_TIMEOUT_MS);
    }

    async function fallbackPollOnce() {
        try {
            const response = await fetch(FALLBACK_POLL_URL, { headers: { 'X-Client-Key': clientKey } });

            if (!response.ok) {
                logOriginIssue(response.status);
                if (onHealthChange) onHealthChange(false);
                return;
            }

            const data = await response.json();
            persistData(data);
            onUpdate(data);

            const originErrorStatus = response.headers.get('X-Origin-Error-Status');
            if (originErrorStatus) logOriginIssue(Number(originErrorStatus));
            else noteOriginHealthy();
            if (onHealthChange) onHealthChange(true);
        } catch (err) {
            logEvent(`alert-proxy request error: ${err.message}`, 'NETWORK');
            if (onHealthChange) onHealthChange(false);
        }
    }

    function startFallbackPolling() {
        if (usingFallback || stopped) return;
        usingFallback = true;
        logEvent('alert-proxy (alerts.in.ua): WebSocket unavailable, falling back to polling', 'NETWORK');
        fallbackPollOnce();
        fallbackTimer = setInterval(fallbackPollOnce, FALLBACK_POLL_INTERVAL_MS);
    }

    function stopFallbackPolling() {
        if (!usingFallback) return;
        usingFallback = false;
        if (fallbackTimer) clearInterval(fallbackTimer);
        fallbackTimer = null;
        logEvent('alert-proxy (alerts.in.ua): WebSocket recovered, stopping fallback polling', 'NETWORK');
    }

    function scheduleReconnect() {
        if (stopped) return;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    function connect() {
        if (stopped) return;
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
            ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(clientKey)}`);
        } catch (err) {
            logEvent(`alert-proxy (alerts.in.ua) WebSocket connection failed: ${err.message}`, 'NETWORK');
            startFallbackPolling();
            scheduleReconnect();
            return;
        }
        socket = ws;

        ws.addEventListener('open', () => {
            logEvent('alert-proxy (alerts.in.ua) WebSocket connected', 'NETWORK');
            resetHeartbeatWatch();
        });

        ws.addEventListener('message', (event) => {
            resetHeartbeatWatch();
            stopFallbackPolling();
            noteOriginHealthy();
            if (onHealthChange) onHealthChange(true);

            try {
                const data = JSON.parse(event.data);
                if (data && data.type === 'heartbeat') {
                    const cached = getLatestAlertData();
                    if (cached) onUpdate(cached);
                    return;
                }
                persistData(data);
                onUpdate(data);
            } catch (err) {
                logEvent(`alert-proxy (alerts.in.ua) WebSocket message parse failed: ${err.message}`, 'NETWORK');
            }
        });

        ws.addEventListener('close', () => {
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
            if (stopped || socket !== ws) return;
            startFallbackPolling();
            scheduleReconnect();
        });

        ws.addEventListener('error', (event) => {
            logEvent(`alert-proxy (alerts.in.ua) WebSocket error: ${event.message || 'unknown error'}`, 'NETWORK');
        });
    }

    connect();

    return {
        stop: () => {
            stopped = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
            if (fallbackTimer) clearInterval(fallbackTimer);
            if (socket) {
                try {
                    socket.close();
                } catch (err) {}
            }
        },
    };
}

module.exports = { startPolling };

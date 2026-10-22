// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');
const { logEvent } = require('./logger');
const { setLatestAlertData, getLatestAlertData } = require('./activeAlertData');
const { PROXY_WS_URL, getClientVersion, proxyFetch, describeError } = require('./proxyConfig');

const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60000;
const HEARTBEAT_TIMEOUT_MS = 8 * 60 * 1000;
const FALLBACK_POLL_INTERVAL_MS = 60000;

function persistData(data) {
    setLatestAlertData(data);
    fs.writeFileSync(getUserDataFile('alert_received.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function startProxyStream({ label, wsPath, pollUrl, clientKey, onUpdate, onHealthChange, hooks = {} }) {
    const wsUrl = `${PROXY_WS_URL}${wsPath}`;
    let socket = null;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let fallbackTimer = null;
    let stopped = false;
    let usingFallback = false;
    let reconnectAttempts = 0;

    function resetHeartbeatWatch() {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
            logEvent(`${label}: no messages received - reconnecting`, 'NETWORK');
            connect();
        }, HEARTBEAT_TIMEOUT_MS);
    }

    function deliver(data, meta) {
        if (hooks.onData) hooks.onData(data);
        if (hooks.accept && !hooks.accept(data)) return;
        persistData(data);
        onUpdate(data, meta);
    }

    async function fallbackPollOnce() {
        try {
            const response = await proxyFetch(pollUrl, { headers: { 'X-Client-Key': clientKey, 'X-Client-Version': getClientVersion() } });

            if (!response.ok) {
                if (hooks.onPollFailed) hooks.onPollFailed(response.status);
                if (onHealthChange) onHealthChange(false);
                return;
            }

            deliver(await response.json());
            if (hooks.onPollResponse) hooks.onPollResponse(response);
            if (onHealthChange) onHealthChange(true);
        } catch (err) {
            logEvent(`${label} fallback request error: ${describeError(err)}`, 'NETWORK');
            if (onHealthChange) onHealthChange(false);
        }
    }

    function startFallbackPolling() {
        if (usingFallback || stopped) return;
        usingFallback = true;
        logEvent(`${label}: unavailable - falling back to polling`, 'NETWORK');
        fallbackPollOnce();
        fallbackTimer = setInterval(fallbackPollOnce, FALLBACK_POLL_INTERVAL_MS);
    }

    function stopFallbackPolling() {
        if (!usingFallback) return;
        usingFallback = false;
        if (fallbackTimer) clearInterval(fallbackTimer);
        fallbackTimer = null;
        logEvent(`${label}: recovered - stopping fallback polling`, 'NETWORK');
    }

    function scheduleReconnect() {
        if (stopped) return;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        const delay = Math.min(RECONNECT_DELAY_MS * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
        reconnectAttempts += 1;
        reconnectTimer = setTimeout(connect, delay);
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
            ws = new WebSocket(`${wsUrl}?key=${encodeURIComponent(clientKey)}&v=${encodeURIComponent(getClientVersion())}`);
        } catch (err) {
            logEvent(`${label} connection failed: ${describeError(err)}`, 'NETWORK');
            startFallbackPolling();
            scheduleReconnect();
            return;
        }
        socket = ws;

        ws.addEventListener('open', () => {
            logEvent(`${label} connected`, 'NETWORK');
            reconnectAttempts = 0;
            resetHeartbeatWatch();
        });

        ws.addEventListener('message', (event) => {
            resetHeartbeatWatch();
            stopFallbackPolling();
            if (hooks.onLinkHealthy) hooks.onLinkHealthy();
            if (onHealthChange) onHealthChange(true);

            try {
                const data = JSON.parse(event.data);
                if (data && data.type === 'heartbeat') {
                    if (hooks.onHeartbeat) hooks.onHeartbeat(data);
                    if (hooks.acceptHeartbeat && !hooks.acceptHeartbeat(data)) return;
                    const cached = getLatestAlertData();
                    if (cached) onUpdate(cached, { heartbeat: true });
                    return;
                }
                deliver(data);
            } catch (err) {
                logEvent(`${label} message parse failed: ${err.message}`, 'NETWORK');
            }
        });

        ws.addEventListener('close', (event) => {
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
            if (stopped || socket !== ws) return;
            logEvent(`${label} connection closed (code ${event.code}${event.reason ? `: ${event.reason}` : ''}) - reconnecting`, 'NETWORK');
            startFallbackPolling();
            scheduleReconnect();
        });

        ws.addEventListener('error', () => {});
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

module.exports = { startProxyStream };

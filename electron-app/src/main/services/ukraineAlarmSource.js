// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { setLatestAlertData } = require('./activeAlertData');

const WS_URL = 'wss://alert-proxy.alert-proxy-ua.workers.dev/ws';
const FALLBACK_POLL_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev/ukrainealarm-alerts';
const RECONNECT_DELAY_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 45000;
const FALLBACK_POLL_INTERVAL_MS = 30000;

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
            logEvent('UkraineAlarm (via alert-proxy) WebSocket: no messages received, reconnecting', 'NETWORK');
            connect();
        }, HEARTBEAT_TIMEOUT_MS);
    }

    async function fallbackPollOnce() {
        try {
            const response = await fetch(FALLBACK_POLL_URL, { headers: { 'X-Client-Key': clientKey } });
            if (!response.ok) {
                logEvent(`UkraineAlarm (via alert-proxy) fallback fetch failed: ${response.status}`, 'NETWORK');
                if (onHealthChange) onHealthChange(false);
                return;
            }

            const data = await response.json();
            setLatestAlertData(data);
            onUpdate(data);
            if (onHealthChange) onHealthChange(true);
        } catch (err) {
            logEvent(`UkraineAlarm (via alert-proxy) fallback request error: ${err.message}`, 'NETWORK');
            if (onHealthChange) onHealthChange(false);
        }
    }

    function startFallbackPolling() {
        if (usingFallback || stopped) return;
        usingFallback = true;
        logEvent('UkraineAlarm (via alert-proxy): WebSocket unavailable, falling back to polling', 'NETWORK');
        fallbackPollOnce();
        fallbackTimer = setInterval(fallbackPollOnce, FALLBACK_POLL_INTERVAL_MS);
    }

    function stopFallbackPolling() {
        if (!usingFallback) return;
        usingFallback = false;
        if (fallbackTimer) clearInterval(fallbackTimer);
        fallbackTimer = null;
        logEvent('UkraineAlarm (via alert-proxy): WebSocket recovered, stopping fallback polling', 'NETWORK');
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
            } catch (err) {
                /* already closing/closed */
            }
        }

        let ws;
        try {
            ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(clientKey)}`);
        } catch (err) {
            logEvent(`UkraineAlarm (via alert-proxy) WebSocket connection failed: ${err.message}`, 'NETWORK');
            startFallbackPolling();
            scheduleReconnect();
            return;
        }
        socket = ws;

        ws.addEventListener('open', resetHeartbeatWatch);

        ws.addEventListener('message', (event) => {
            resetHeartbeatWatch();
            stopFallbackPolling();
            try {
                const data = JSON.parse(event.data);
                setLatestAlertData(data);
                onUpdate(data);
                if (onHealthChange) onHealthChange(true);
            } catch (err) {
                logEvent(`UkraineAlarm (via alert-proxy) WebSocket message parse failed: ${err.message}`, 'NETWORK');
            }
        });

        ws.addEventListener('close', () => {
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
            if (stopped || socket !== ws) return;
            startFallbackPolling();
            scheduleReconnect();
        });

        ws.addEventListener('error', (event) => {
            logEvent(`UkraineAlarm (via alert-proxy) WebSocket error: ${event.message || 'unknown error'}`, 'NETWORK');
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
                } catch (err) {
                    /* already closing/closed */
                }
            }
        },
    };
}

module.exports = { startPolling };

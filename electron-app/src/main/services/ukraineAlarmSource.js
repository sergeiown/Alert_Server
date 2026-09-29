// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { logEvent } = require('./logger');
const { setLatestAlertData, getLatestAlertData } = require('./activeAlertData');

const { PROXY_URL, PROXY_WS_URL, getClientVersion } = require('./proxyConfig');

const WS_URL = `${PROXY_WS_URL}/ws`;
const FALLBACK_POLL_URL = `${PROXY_URL}/ukrainealarm-alerts`;
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60000;
const HEARTBEAT_TIMEOUT_MS = 8 * 60 * 1000;
const FALLBACK_POLL_INTERVAL_MS = 60000;

function startPolling(clientKey, onUpdate, onHealthChange) {
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
            logEvent('UkraineAlarm: no messages received - reconnecting', 'NETWORK');
            connect();
        }, HEARTBEAT_TIMEOUT_MS);
    }

    async function fallbackPollOnce() {
        try {
            const response = await fetch(FALLBACK_POLL_URL, { headers: { 'X-Client-Key': clientKey, 'X-Client-Version': getClientVersion() } });
            if (!response.ok) {
                logEvent(`UkraineAlarm fallback fetch failed: ${response.status}`, 'NETWORK');
                if (onHealthChange) onHealthChange(false);
                return;
            }

            const data = await response.json();
            setLatestAlertData(data);
            onUpdate(data);
            if (onHealthChange) onHealthChange(true);
        } catch (err) {
            logEvent(`UkraineAlarm fallback request error: ${err.message}`, 'NETWORK');
            if (onHealthChange) onHealthChange(false);
        }
    }

    function startFallbackPolling() {
        if (usingFallback || stopped) return;
        usingFallback = true;
        logEvent('UkraineAlarm: unavailable - falling back to polling', 'NETWORK');
        fallbackPollOnce();
        fallbackTimer = setInterval(fallbackPollOnce, FALLBACK_POLL_INTERVAL_MS);
    }

    function stopFallbackPolling() {
        if (!usingFallback) return;
        usingFallback = false;
        if (fallbackTimer) clearInterval(fallbackTimer);
        fallbackTimer = null;
        logEvent('UkraineAlarm: recovered - stopping fallback polling', 'NETWORK');
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
            ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(clientKey)}&v=${encodeURIComponent(getClientVersion())}`);
        } catch (err) {
            logEvent(`UkraineAlarm connection failed: ${err.message}`, 'NETWORK');
            startFallbackPolling();
            scheduleReconnect();
            return;
        }
        socket = ws;

        ws.addEventListener('open', () => {
            logEvent('UkraineAlarm connected', 'NETWORK');
            reconnectAttempts = 0;
            resetHeartbeatWatch();
        });

        ws.addEventListener('message', (event) => {
            resetHeartbeatWatch();
            stopFallbackPolling();
            if (onHealthChange) onHealthChange(true);

            try {
                const data = JSON.parse(event.data);
                if (data && data.type === 'heartbeat') {
                    const cached = getLatestAlertData();
                    if (cached) onUpdate(cached, { heartbeat: true });
                    return;
                }
                setLatestAlertData(data);
                onUpdate(data);
            } catch (err) {
                logEvent(`UkraineAlarm message parse failed: ${err.message}`, 'NETWORK');
            }
        });

        ws.addEventListener('close', (event) => {
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
            if (stopped || socket !== ws) return;
            logEvent(`UkraineAlarm connection closed (code ${event.code}${event.reason ? `: ${event.reason}` : ''}) - reconnecting`, 'NETWORK');
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

module.exports = { startPolling };

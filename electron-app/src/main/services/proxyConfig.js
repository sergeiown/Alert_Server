// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { getInstallId } = require('./installId');

const PROXY_URL = 'https://alert-proxy-ua.duckdns.org';
const PROXY_WS_URL = PROXY_URL.replace(/^http/, 'ws');

const REQUEST_TIMEOUT_MS = 10000;
const RETRY_PAUSE_MS = 1500;

function getClientVersion() {
    try {
        return require('electron').app.getVersion();
    } catch (err) {
        return '';
    }
}

function pause(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(options, timeoutMs) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options && options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    return { ...options, signal };
}

function withInstallId(url, options) {
    if (typeof url !== 'string' || !url.startsWith(PROXY_URL)) return options;
    const current = options && options.headers;
    if (current && typeof current.set === 'function') {
        const headers = new Headers(current);
        headers.set('X-Client-Id', getInstallId());
        return { ...options, headers };
    }
    return { ...options, headers: { ...current, 'X-Client-Id': getInstallId() } };
}

function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
    return fetch(url, withTimeout(withInstallId(url, options), timeoutMs));
}

async function proxyFetch(url, options) {
    try {
        return await fetchWithTimeout(url, options);
    } catch (err) {
        await pause(RETRY_PAUSE_MS);
        return fetchWithTimeout(url, options);
    }
}

function describeError(err) {
    const cause = err && err.cause;
    const detail = cause && (cause.code || cause.message);
    return detail ? `${err.message} (${detail})` : err.message;
}

module.exports = { PROXY_URL, PROXY_WS_URL, getClientVersion, proxyFetch, fetchWithTimeout, describeError };

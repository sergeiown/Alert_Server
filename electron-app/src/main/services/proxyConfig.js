// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const PROXY_URL = 'https://alert-proxy-ua.duckdns.org';
const PROXY_WS_URL = PROXY_URL.replace(/^http/, 'ws');

function getClientVersion() {
    try {
        return require('electron').app.getVersion();
    } catch (err) {
        return '';
    }
}

async function proxyFetch(url, options) {
    try {
        return await fetch(url, options);
    } catch (err) {
        return fetch(url, options);
    }
}

function describeError(err) {
    const cause = err && err.cause;
    const detail = cause && (cause.code || cause.message);
    return detail ? `${err.message} (${detail})` : err.message;
}

module.exports = { PROXY_URL, PROXY_WS_URL, getClientVersion, proxyFetch, describeError };

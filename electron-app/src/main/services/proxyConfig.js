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

module.exports = { PROXY_URL, PROXY_WS_URL, getClientVersion };

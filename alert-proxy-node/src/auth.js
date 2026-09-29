// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const nodeCrypto = require('node:crypto');
const { CLIENT_KEY, ADMIN_KEY } = require('./config');

function timingSafeEqualStr(a, b) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return nodeCrypto.timingSafeEqual(bufA, bufB);
}

function checkClientKey(url, headers) {
    const provided = headers['x-client-key'] || url.searchParams.get('key') || '';
    return Boolean(CLIENT_KEY) && timingSafeEqualStr(provided, CLIENT_KEY);
}

function checkAdminKey(url, headers) {
    const provided = headers['x-admin-key'] || url.searchParams.get('adminKey') || '';
    return Boolean(ADMIN_KEY) && timingSafeEqualStr(provided, ADMIN_KEY);
}

module.exports = { checkClientKey, checkAdminKey };

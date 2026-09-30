// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 1200;
const ADMIN_FAIL_LIMIT = 10;
const ADMIN_FAIL_WINDOW_MS = 10 * 60 * 1000;
const MAX_WEBSOCKETS_PER_IP = 50;
const PUBLIC_MAX_REQUESTS_PER_WINDOW = 240;
const PUBLIC_MAX_WEBSOCKETS_PER_IP = 5;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const hits = new Map();
const adminFailures = new Map();
const openSockets = new Map();
const publicHits = new Map();
const publicOpenSockets = new Map();

function allowRequest(ip) {
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + WINDOW_MS };
        hits.set(ip, entry);
    }
    entry.count += 1;
    return entry.count <= MAX_REQUESTS_PER_WINDOW;
}

function allowPublicRequest(ip) {
    const now = Date.now();
    let entry = publicHits.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + WINDOW_MS };
        publicHits.set(ip, entry);
    }
    entry.count += 1;
    return entry.count <= PUBLIC_MAX_REQUESTS_PER_WINDOW;
}

function openPublicSocket(ip) {
    const current = publicOpenSockets.get(ip) || 0;
    if (current >= PUBLIC_MAX_WEBSOCKETS_PER_IP) return false;
    publicOpenSockets.set(ip, current + 1);
    return true;
}

function closePublicSocket(ip) {
    const current = publicOpenSockets.get(ip) || 0;
    if (current <= 1) publicOpenSockets.delete(ip);
    else publicOpenSockets.set(ip, current - 1);
}

function isAdminBlocked(ip) {
    const entry = adminFailures.get(ip);
    return Boolean(entry && entry.blockedUntil && Date.now() < entry.blockedUntil);
}

function noteAdminFailure(ip) {
    const now = Date.now();
    let entry = adminFailures.get(ip);
    if (!entry || now - entry.firstAt > ADMIN_FAIL_WINDOW_MS) entry = { count: 0, firstAt: now, blockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= ADMIN_FAIL_LIMIT) entry.blockedUntil = now + ADMIN_FAIL_WINDOW_MS;
    adminFailures.set(ip, entry);
}

function openSocket(ip) {
    const current = openSockets.get(ip) || 0;
    if (current >= MAX_WEBSOCKETS_PER_IP) return false;
    openSockets.set(ip, current + 1);
    return true;
}

function connectedClientCount() {
    return openSockets.size;
}

function closeSocket(ip) {
    const current = openSockets.get(ip) || 0;
    if (current <= 1) openSockets.delete(ip);
    else openSockets.set(ip, current - 1);
}

setInterval(() => {
    const now = Date.now();
    hits.forEach((entry, ip) => {
        if (now > entry.resetAt) hits.delete(ip);
    });
    publicHits.forEach((entry, ip) => {
        if (now > entry.resetAt) publicHits.delete(ip);
    });
    adminFailures.forEach((entry, ip) => {
        if (now - entry.firstAt > ADMIN_FAIL_WINDOW_MS && now > entry.blockedUntil) adminFailures.delete(ip);
    });
}, CLEANUP_INTERVAL_MS).unref();

module.exports = {
    allowRequest,
    allowPublicRequest,
    isAdminBlocked,
    noteAdminFailure,
    openSocket,
    closeSocket,
    connectedClientCount,
    openPublicSocket,
    closePublicSocket,
};

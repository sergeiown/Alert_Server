// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function clientIpOf(request) {
    const remote = request.socket && request.socket.remoteAddress;
    if (!LOOPBACK.has(remote)) return remote;
    const forwarded = request.headers['x-forwarded-for'];
    if (!forwarded) return remote;
    const parts = String(forwarded)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    return parts.length ? parts[parts.length - 1] : remote;
}

module.exports = { clientIpOf };

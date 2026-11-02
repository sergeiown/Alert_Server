// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const SAMPLE_LIMIT = 9;
const MAX_ROUND_TRIP_MS = 5000;
const HEADER_RESOLUTION_MS = 1000;

const estimates = [];
let offsetMs = 0;

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function observe(serverMs, requestStartMs, responseEndMs) {
    if (!Number.isFinite(serverMs) || !Number.isFinite(requestStartMs) || !Number.isFinite(responseEndMs)) return;
    if (responseEndMs < requestStartMs || responseEndMs - requestStartMs > MAX_ROUND_TRIP_MS) return;
    const localMidpoint = (requestStartMs + responseEndMs) / 2;
    estimates.push(serverMs + HEADER_RESOLUTION_MS / 2 - localMidpoint);
    if (estimates.length > SAMPLE_LIMIT) estimates.shift();
    offsetMs = Math.round(median(estimates));
}

function observeResponse(response, requestStartMs, responseEndMs) {
    const header = response && response.headers && response.headers.get && response.headers.get('date');
    if (header) observe(Date.parse(header), requestStartMs, responseEndMs);
}

function now() {
    return Date.now() + offsetMs;
}

function getOffsetMs() {
    return offsetMs;
}

function reset() {
    estimates.length = 0;
    offsetMs = 0;
}

module.exports = { observe, observeResponse, now, getOffsetMs, reset };

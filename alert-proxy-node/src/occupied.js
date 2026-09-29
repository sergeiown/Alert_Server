// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const BASE_URL = 'https://raw.githubusercontent.com/cyterat/deepstate-map-data/main/data/deepstatemap_data_';
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_LOOKBACK_DAYS = 5;

let cached = { body: null, date: null, fetchedAt: 0, error: null };

function formatDate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

async function refresh() {
    const now = Date.now();
    for (let daysBack = 0; daysBack < MAX_LOOKBACK_DAYS; daysBack++) {
        const dateStr = formatDate(new Date(now - daysBack * 24 * 60 * 60 * 1000));
        if (cached.date === dateStr) {
            cached.fetchedAt = Date.now();
            return;
        }

        try {
            const response = await fetch(`${BASE_URL}${dateStr}.geojson`);
            if (!response.ok) continue;
            const body = await response.text();
            JSON.parse(body);
            cached = { body, date: dateStr, fetchedAt: Date.now(), error: null };
            console.log(`[occupied] updated ${dateStr} (${body.length} bytes)`);
            return;
        } catch (err) {
            cached.error = err.message;
        }
    }
}

function start() {
    const run = async () => {
        try {
            await refresh();
        } finally {
            setTimeout(run, REFRESH_INTERVAL_MS);
        }
    };
    run();
}

function getResponse() {
    if (!cached.body) {
        return { status: 503, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: cached.error || 'no data yet' }) };
    }
    return {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Data-Date': cached.date, 'Cache-Control': 'public, max-age=600' },
        body: cached.body,
    };
}

function getStatusInfo() {
    return {
        date: cached.date,
        cacheAgeMs: cached.fetchedAt ? Date.now() - cached.fetchedAt : null,
        sizeBytes: cached.body ? cached.body.length : null,
        error: cached.error,
    };
}

module.exports = { start, getResponse, getStatusInfo };

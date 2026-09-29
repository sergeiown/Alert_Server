// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { DATA_DIR } = require('./config');

const GEO_DIR = path.join(DATA_DIR, 'geoip');
const GEO_FILE = path.join(GEO_DIR, 'dbip-country-lite.csv.gz');
const MAX_AGE_MS = 32 * 24 * 60 * 60 * 1000;
const RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

let v4 = { starts: new Uint32Array(0), ends: new Uint32Array(0), codes: new Uint16Array(0) };
let v6 = { starts: [], ends: [], codes: new Uint16Array(0) };
let countryNames = [];
let status = { loaded: false, ranges: 0, updatedAt: null, error: null };

function parseIpv4(text) {
    const parts = text.split('.');
    if (parts.length !== 4) return null;
    let value = 0;
    for (const part of parts) {
        const n = Number(part);
        if (!Number.isInteger(n) || n < 0 || n > 255) return null;
        value = value * 256 + n;
    }
    return value;
}

function parseIpv6(text) {
    let address = text.split('%')[0];
    const lastColon = address.lastIndexOf(':');
    if (address.slice(lastColon + 1).includes('.')) {
        const embedded = parseIpv4(address.slice(lastColon + 1));
        if (embedded === null) return null;
        address = `${address.slice(0, lastColon + 1)}${(embedded >>> 16).toString(16)}:${(embedded & 0xffff).toString(16)}`;
    }

    const halves = address.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;

    const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...tail];
    let value = 0n;
    for (const group of groups) {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
        value = (value << 16n) + BigInt(parseInt(group, 16));
    }
    return value;
}

function parseDatabase(csv) {
    const codeIndex = new Map();
    const names = [];
    const indexOf = (code) => {
        let index = codeIndex.get(code);
        if (index === undefined) {
            index = names.length;
            names.push(code);
            codeIndex.set(code, index);
        }
        return index;
    };

    const starts4 = [];
    const ends4 = [];
    const codes4 = [];
    const starts6 = [];
    const ends6 = [];
    const codes6 = [];

    csv.split('\n').forEach((line) => {
        const cells = line.replace(/\r$/, '').replace(/"/g, '').split(',');
        if (cells.length < 3 || !cells[2]) return;
        const code = cells[2].trim();
        if (cells[0].includes(':')) {
            const start = parseIpv6(cells[0]);
            const end = parseIpv6(cells[1]);
            if (start === null || end === null) return;
            starts6.push(start);
            ends6.push(end);
            codes6.push(indexOf(code));
        } else {
            const start = parseIpv4(cells[0]);
            const end = parseIpv4(cells[1]);
            if (start === null || end === null) return;
            starts4.push(start);
            ends4.push(end);
            codes4.push(indexOf(code));
        }
    });

    countryNames = names;
    v4 = { starts: Uint32Array.from(starts4), ends: Uint32Array.from(ends4), codes: Uint16Array.from(codes4) };
    v6 = { starts: starts6, ends: ends6, codes: Uint16Array.from(codes6) };
    return starts4.length + starts6.length;
}

function search(starts, ends, value) {
    let low = 0;
    let high = starts.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (value < starts[mid]) high = mid - 1;
        else if (value > ends[mid]) low = mid + 1;
        else return mid;
    }
    return -1;
}

function lookup(ip) {
    if (!status.loaded || !ip) return null;
    const text = String(ip).trim();

    const mapped = text.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    const candidate = mapped ? mapped[1] : text;

    if (candidate.includes(':')) {
        const value = parseIpv6(candidate);
        if (value === null) return null;
        const index = search(v6.starts, v6.ends, value);
        return index === -1 ? null : countryNames[v6.codes[index]];
    }

    const value = parseIpv4(candidate);
    if (value === null) return null;
    const index = search(v4.starts, v4.ends, value);
    return index === -1 ? null : countryNames[v4.codes[index]];
}

function monthUrls() {
    const now = new Date();
    const format = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    return [format(now), format(previous)].map((month) => `https://download.db-ip.com/free/dbip-country-lite-${month}.csv.gz`);
}

async function download() {
    for (const url of monthUrls()) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const buffer = Buffer.from(await response.arrayBuffer());
            zlib.gunzipSync(buffer);
            fs.mkdirSync(GEO_DIR, { recursive: true });
            const temp = `${GEO_FILE}.tmp`;
            fs.writeFileSync(temp, buffer, { mode: 0o600 });
            fs.renameSync(temp, GEO_FILE);
            console.log(`[geoip] downloaded ${url} (${buffer.length} bytes)`);
            return true;
        } catch (err) {
            status.error = err.message;
        }
    }
    return false;
}

function load() {
    const csv = zlib.gunzipSync(fs.readFileSync(GEO_FILE)).toString('utf-8');
    const ranges = parseDatabase(csv);
    status = { loaded: true, ranges, updatedAt: fs.statSync(GEO_FILE).mtime.toISOString(), error: null };
    console.log(`[geoip] loaded ${ranges} ranges`);
}

async function ensure() {
    let stale = true;
    try {
        stale = Date.now() - fs.statSync(GEO_FILE).mtimeMs > MAX_AGE_MS;
    } catch (err) {}

    if (stale) {
        const downloaded = await download();
        if (!downloaded && !fs.existsSync(GEO_FILE)) return;
    }

    try {
        load();
    } catch (err) {
        status.error = err.message;
        console.error('[geoip] load failed', err && err.stack ? err.stack : err);
    }
}

function start() {
    const run = async () => {
        try {
            await ensure();
        } finally {
            setTimeout(run, RECHECK_INTERVAL_MS).unref();
        }
    };
    run();
}

function getStatusInfo() {
    return { ...status };
}

module.exports = { start, lookup, getStatusInfo };

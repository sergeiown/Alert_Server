// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const http = require('node:http');
const { PORT, UKRAINEALARM_WEBHOOK_PATH } = require('./config');
const ratelimit = require('./ratelimit');
const { checkClientKey, checkAdminKey } = require('./auth');
const { attachWebSockets } = require('./ws');
const { startRecurringJob } = require('./job');
const gateway = require('./gateway');
const neptun = require('./neptun');
const archive = require('./archive');
const users = require('./users');
const forecast = require('./forecast');
const trends = require('./trends');
const occupied = require('./occupied');

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket.remoteAddress;
}

function normalizeRoute(pathname) {
    if (pathname === '/') return '/';
    return pathname.replace(/\/\d{8}$/, '/:date').replace(/\/\d+$/, '/:uid');
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
    });
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Client-Key, X-Admin-Key',
};

function send(res, result) {
    res.writeHead(result.status, { ...CORS_HEADERS, ...result.headers });
    res.end(result.body);
}

async function handleRequest(req, res) {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    const requesterIp = getClientIp(req);
    if (!ratelimit.allowRequest(requesterIp)) {
        send(res, { status: 429, headers: { 'Retry-After': '60' }, body: 'Too many requests' });
        return;
    }

    if (UKRAINEALARM_WEBHOOK_PATH && url.pathname === UKRAINEALARM_WEBHOOK_PATH) {
        if (req.method !== 'POST') {
            send(res, { status: 405, headers: {}, body: 'Method not allowed' });
            return;
        }
        const rawBody = await readBody(req);
        const result = await gateway.handleUkraineAlarmWebhook(req.headers, rawBody);
        send(res, result);
        return;
    }

    if (req.method !== 'GET') {
        send(res, { status: 405, headers: {}, body: 'Method not allowed' });
        return;
    }

    const isAdminRoute = url.pathname === '/status' || url.pathname === '/ukrainealarm-status' || url.pathname === '/users-stats';
    if (isAdminRoute && ratelimit.isAdminBlocked(requesterIp)) {
        send(res, { status: 429, headers: { 'Retry-After': '600' }, body: 'Too many failed attempts' });
        return;
    }

    const authorized = isAdminRoute ? checkAdminKey(url, req.headers) : checkClientKey(url, req.headers);
    if (!authorized) {
        if (isAdminRoute) ratelimit.noteAdminFailure(requesterIp);
        send(res, { status: 401, headers: {}, body: 'Unauthorized' });
        return;
    }

    if (!isAdminRoute) {
        await gateway.recordUniqueUser(requesterIp);
        await users.recordRequest(requesterIp, normalizeRoute(url.pathname), req.headers['x-client-version'] || url.searchParams.get('v'));
    }

    const ifModifiedSince = req.headers['if-modified-since'];

    const historyMatch = url.pathname.match(/^\/history\/(\d+)$/);
    if (historyMatch) {
        send(res, await gateway.getHistory(historyMatch[1]));
        return;
    }

    if (url.pathname === '/region-statuses') {
        send(res, await gateway.getRegionStatuses());
        return;
    }

    if (url.pathname === '/today-stats') {
        send(res, gateway.getTodayStats());
        return;
    }

    if (url.pathname === '/weapon-stats') {
        send(res, await gateway.getWeaponStats());
        return;
    }

    if (url.pathname === '/status') {
        send(res, gateway.getStatus());
        return;
    }

    if (url.pathname === '/users-stats') {
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(users.getStats(gateway.totalConnections())) });
        return;
    }

    const forecastMatch = url.pathname.match(/^\/forecast\/(\d+)$/);
    if (forecastMatch) {
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(forecast.getForecast(forecastMatch[1])) });
        return;
    }

    if (url.pathname === '/trends/today') {
        const uids = (url.searchParams.get('uids') || '').split(',').filter((uid) => /^\d+$/.test(uid)).slice(0, 200);
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(trends.getTodayStats(uids)) });
        return;
    }

    if (url.pathname === '/daily-peaks') {
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(trends.getDailyPeaks()) });
        return;
    }

    if (url.pathname === '/map/occupied') {
        send(res, occupied.getResponse());
        return;
    }

    if (url.pathname === '/neptun/alerts') {
        send(res, neptun.getAlertsResponse());
        return;
    }

    if (url.pathname === '/neptun/threats') {
        send(res, neptun.getThreatsResponse());
        return;
    }

    if (url.pathname === '/archive/alerts') {
        const rows = archive.getAlertsSince(url.searchParams.get('since'), url.searchParams.get('uid'));
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alerts: rows }) });
        return;
    }

    if (url.pathname === '/ukrainealarm-status') {
        send(res, await gateway.getUkraineAlarmStatus());
        return;
    }

    if (url.pathname === '/ukrainealarm-alerts') {
        send(res, await gateway.getUkraineAlarmAlerts());
        return;
    }

    if (url.pathname === '/ukrainealarm-today-stats') {
        send(res, await gateway.getUkraineAlarmTodayStats());
        return;
    }

    const ukraineAlarmDateStatsMatch = url.pathname.match(/^\/ukrainealarm-date-stats\/(\d{8})$/);
    if (ukraineAlarmDateStatsMatch) {
        send(res, await gateway.getUkraineAlarmDateStats(ukraineAlarmDateStatsMatch[1]));
        return;
    }

    const ukraineAlarmRegionHistoryMatch = url.pathname.match(/^\/ukrainealarm-region-history\/(\d+)$/);
    if (ukraineAlarmRegionHistoryMatch) {
        send(res, await gateway.getUkraineAlarmRegionHistory(ukraineAlarmRegionHistoryMatch[1]));
        return;
    }

    send(res, await gateway.getActive(ifModifiedSince));
}

const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
        console.error('[request]', err && err.stack ? err.stack : err);
        if (!res.headersSent) send(res, { status: 500, headers: {}, body: 'Internal error' });
    });
});

attachWebSockets(server);

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err && err.stack ? err.stack : err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err && err.stack ? err.stack : err));

server.listen(PORT, '127.0.0.1', () => {
    console.log(`alert-proxy-node listening on 127.0.0.1:${PORT}`);
    startRecurringJob();
});

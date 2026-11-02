// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const http = require('node:http');
require('./logbook').install();
const { PORT, UKRAINEALARM_WEBHOOK_PATH } = require('./config');
const ratelimit = require('./ratelimit');
const { checkClientKey, checkAdminKey } = require('./auth');
const { attachWebSockets } = require('./ws');
const { startRecurringJob } = require('./job');
const gateway = require('./gateway');
const neptun = require('./neptun');
const merge = require('./merge');
const archive = require('./archive');
const users = require('./users');
const forecast = require('./forecast');
const trends = require('./trends');
const threatAnalytics = require('./threatAnalytics');
const occupied = require('./occupied');
const publicApi = require('./publicApi');
const perfStats = require('./perfStats');
const online = require('./online');
const webstats = require('./webstats');
const config = require('./config');
const logbook = require('./logbook');
const lib = require('./lib');
const geoip = require('./geoip');
const { db } = require('./store');
const { createFeedbackStore } = require('./feedback');

const feedbackStore = createFeedbackStore(db);
const FEEDBACK_BODY_LIMIT = 16 * 1024;

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket.remoteAddress;
}

function normalizeRoute(pathname) {
    if (pathname === '/') return '/';
    return pathname.replace(/\/\d{8}$/, '/:date').replace(/\/\d+$/, '/:uid');
}

function readLimitedBody(req, limit) {
    return new Promise((resolve) => {
        const chunks = [];
        let size = 0;
        let rejected = false;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                rejected = true;
                req.destroy();
                resolve(null);
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (!rejected) resolve(Buffer.concat(chunks).toString('utf-8'));
        });
        req.on('error', () => resolve(null));
    });
}

function jsonResult(status, payload, headers = {}) {
    return { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }, body: JSON.stringify(payload) };
}

async function handleFeedbackPost(req, url, requesterIp) {
    const isAdmin = url.pathname === '/feedback-update';
    if (isAdmin && ratelimit.isAdminBlocked(requesterIp)) return jsonResult(429, { error: 'blocked' }, { 'Retry-After': '600' });
    const authorized = isAdmin ? checkAdminKey(url, req.headers) : checkClientKey(url, req.headers);
    if (!authorized) {
        if (isAdmin) ratelimit.noteAdminFailure(requesterIp);
        return jsonResult(401, { error: 'unauthorized' });
    }

    const raw = await readLimitedBody(req, FEEDBACK_BODY_LIMIT);
    if (raw === null) return jsonResult(413, { error: 'too-large' });
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (err) {
        return jsonResult(400, { error: 'invalid' });
    }

    if (isAdmin) {
        return feedbackStore.update(payload || {}) ? jsonResult(200, { ok: true }) : jsonResult(400, { error: 'invalid' });
    }

    const clientId = lib.normalizeClientId(req.headers['x-client-id']);
    if (!clientId) return jsonResult(400, { error: 'client-id' });
    const result = feedbackStore.submit({
        clientId,
        ipHash: await lib.hashIp(requesterIp),
        country: geoip.lookup(requesterIp),
        version: req.headers['x-client-version'],
        language: payload && payload.language,
        payload,
    });
    const headers = result.retryAfterSec ? { 'Retry-After': String(result.retryAfterSec) } : {};
    return jsonResult(result.status, result.ok ? { ok: true } : { error: result.error }, headers);
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

let privateExtension = null;
try {
    privateExtension = require('./private');
} catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
}

const STATUS_CACHE_MS = 5000;
let statusCache = null;

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

    if (url.pathname.startsWith('/public/')) {
        const publicHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
        if (!config.PUBLIC_API_ENABLED) {
            res.writeHead(404, publicHeaders);
            res.end('Not found');
            return;
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, publicHeaders);
            res.end('Method not allowed');
            return;
        }
        if (!ratelimit.allowPublicRequest(requesterIp)) {
            res.writeHead(429, { ...publicHeaders, 'Retry-After': '60' });
            res.end('Too many requests');
            return;
        }

        const result = publicApi.handle(url.pathname);
        if (!result) {
            res.writeHead(404, publicHeaders);
            res.end('Not found');
            return;
        }
        users.recordHit(url.pathname);
        if (url.pathname === '/public/state') {
            webstats.recordVisitor(requesterIp, url.searchParams.get('l'));
            if (url.searchParams.get('s') === '1') webstats.recordSession();
        }
        res.writeHead(result.status, result.headers);
        res.end(req.method === 'HEAD' ? undefined : result.body);
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

    if (req.method === 'POST' && (url.pathname === '/feedback' || url.pathname === '/feedback-update')) {
        send(res, await handleFeedbackPost(req, url, requesterIp));
        return;
    }

    if (req.method !== 'GET') {
        send(res, { status: 405, headers: {}, body: 'Method not allowed' });
        return;
    }

    const isAdminRoute =
        (privateExtension && privateExtension.routes.includes(url.pathname)) ||
        url.pathname === '/status' || url.pathname === '/ukrainealarm-status' || url.pathname === '/users-stats' || url.pathname === '/users-list' || url.pathname === '/web-stats' || url.pathname === '/log-events' || url.pathname === '/feedback-list';
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
        const clientId = req.headers['x-client-id'] || url.searchParams.get('id');
        await gateway.recordUniqueUser(requesterIp, clientId);
        await users.recordRequest(requesterIp, normalizeRoute(url.pathname), req.headers['x-client-version'] || url.searchParams.get('v'), clientId);
    }

    if (privateExtension && privateExtension.routes.includes(url.pathname)) {
        send(res, await privateExtension.handle(url));
        return;
    }

    const ifModifiedSince = req.headers['if-modified-since'];

    const historyMatch = url.pathname.match(/^\/history\/(\d+)$/);
    if (historyMatch) {
        send(res, await gateway.getHistory(historyMatch[1]));
        return;
    }

    if (url.pathname === '/client-policy') {
        send(res, {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({
                minVersion: config.CLIENT_MIN_VERSION || null,
                enforceAfter: config.CLIENT_ENFORCE_AFTER || null,
            }),
        });
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
        const now = Date.now();
        if (!statusCache || now - statusCache.at > STATUS_CACHE_MS) statusCache = { at: now, response: gateway.getStatus() };
        send(res, statusCache.response);
        return;
    }

    if (url.pathname === '/log-events') {
        const events = logbook.getEvents({ level: url.searchParams.get('level'), limit: url.searchParams.get('limit') });
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events, counts: logbook.getCounts() }) });
        return;
    }

    if (url.pathname === '/feedback-list') {
        send(res, jsonResult(200, feedbackStore.list(url.searchParams.get('limit'))));
        return;
    }

    if (url.pathname === '/users-list') {
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ users: users.getUserList() }) });
        return;
    }

    if (url.pathname === '/users-stats') {
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(users.getStats(gateway.totalConnections(), online.count())) });
        return;
    }

    if (url.pathname === '/forecast') {
        const uids = (url.searchParams.get('uids') || '').split(',').filter((uid) => /^\d{1,12}$/.test(uid));
        if (!uids.length) {
            send(res, { status: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'uids required' }) });
            return;
        }
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: forecast.getForecastsJson(uids) });
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

    if (url.pathname === '/trends/threats') {
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(threatAnalytics.getThreatAnalytics(url.searchParams.get('days'))) });
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

    if (url.pathname === '/alerts-merged') {
        send(res, merge.getResponse());
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

    if (url.pathname === '/web-stats') {
        send(res, { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(webstats.getStats(publicApi.socketCount())) });
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
    const started = process.hrtime.bigint();
    handleRequest(req, res)
        .catch((err) => {
            console.error('[request]', err && err.stack ? err.stack : err);
            if (!res.headersSent) send(res, { status: 500, headers: {}, body: 'Internal error' });
        })
        .finally(() => {
            const route = normalizeRoute((req.url || '/').split('?')[0]);
            perfStats.record(`http ${route}`, Number(process.hrtime.bigint() - started) / 1e6);
        });
});

attachWebSockets(server);

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err && err.stack ? err.stack : err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err && err.stack ? err.stack : err));

server.listen(PORT, '127.0.0.1', () => {
    console.log(`alert-proxy-node listening on 127.0.0.1:${PORT}`);
    startRecurringJob();
    if (privateExtension && privateExtension.start) privateExtension.start();
});

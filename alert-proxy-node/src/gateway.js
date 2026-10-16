// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const config = require('./config');
const ratelimit = require('./ratelimit');
const store = require('./store');
const lib = require('./lib');
const system = require('./system');
const archive = require('./archive');
const neptun = require('./neptun');
const backup = require('./backup');
const logbook = require('./logbook');
const health = require('./health');
const trends = require('./trends');
const occupied = require('./occupied');
const geoip = require('./geoip');
const uniqueUsers = require('./uniqueUsers');

const UNIQUE_USERS_HISTORY_MAX_DAYS = 90;

const ACTIVE_ALERTS_URL = 'https://api.alerts.in.ua/v1/alerts/active.json';
const ACTIVE_CACHE_TTL_MS = 20 * 1000;
const ACTIVE_POLL_INTERVAL_MS = 10 * 1000;
const ACTIVE_HEARTBEAT_INTERVAL_MS = 60 * 1000;
const ACTIVE_MIN_GAP_MS = 5 * 1000;

const HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const HISTORY_MIN_GAP_MS = 35 * 1000;
const WEAPON_STATS_MIN_GAP_MS = 35 * 1000;

const TODAY_STATS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const REGION_STATUSES_URL = 'https://api.alerts.in.ua/v1/iot/active_air_raid_alerts.json';
const REGION_STATUSES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REGION_STATUSES_MIN_GAP_MS = 5 * 1000;

const UKRAINEALARM_BASE_URL = 'https://api.ukrainealarm.com/api/v3';
const UKRAINEALARM_MIN_GAP_MS = 3 * 60 * 1000;
const UKRAINEALARM_REQUEST_GAP_MS = 65 * 1000;
const UKRAINEALARM_ROUTE_MAX_WAIT_MS = 5 * 1000;
const UKRAINEALARM_REQUEST_TIMEOUT_MS = 20 * 1000;
const UKRAINEALARM_STALE_ALERT_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const UKRAINEALARM_MAX_OBSERVATIONS = 30;

const UKRAINEALARM_WEBHOOK_MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;
const WEBHOOK_LAG_SAMPLES = 300;
const UKRAINEALARM_WEBHOOK_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

const UKRAINEALARM_TODAY_CACHE_TTL_MS = 2 * 60 * 1000;
const UKRAINEALARM_TODAY_BACKOFF_THRESHOLD = 3;
const UKRAINEALARM_TODAY_BACKOFF_MS = 30 * 60 * 1000;

const UKRAINEALARM_TODAY_MAX_DURATION_MS = 24 * 60 * 60 * 1000;

const KAGGLE_DATASET = 'piterfm/massive-missile-attacks-on-ukraine';
const KAGGLE_ATTACKS_FILE = 'missile_attacks_daily.csv';
const KAGGLE_MODELS_FILE = 'missiles_and_uavs.csv';
const WEAPON_STATS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WEAPON_STATS_TOP_MODELS = 20;

const LOAD_WINDOW_MS = 60 * 1000;

const state = {
    activeCache: null,
    activeOriginError: null,
    historyCache: new Map(),
    historyOriginErrors: new Map(),
    regionStatusesCache: null,
    regionStatusesOriginError: null,
    weaponStatsCache: null,
    weaponStatsOriginError: null,
    lastActiveOriginFetchAt: 0,
    lastHistoryOriginFetchAt: 0,
    lastRegionStatusesOriginFetchAt: 0,
    lastWeaponStatsOriginFetchAt: 0,

    allAlertsInUaFetchTimestamps: [],
    historyFetchTimestamps: [],
    ukraineAlarmFetchTimestamps: [],
    ukraineAlarmOriginError: null,

    ukraineAlarmDateStatsCache: new Map(),
    ukraineAlarmRegionHistoryCache: new Map(),
    ukraineAlarmRegionHistoryOriginErrors: new Map(),

    ukraineAlarmWebhookSeenHashes: new Map(),
    ukraineAlarmWebhookStats: { startedAt: Date.now(), received: 0, rejected: 0, lagsMs: [] },
    lastBroadcastAlertsBody: null,
    lastBroadcastActiveBody: null,
    activeQueue: Promise.resolve(),
    historyQueue: Promise.resolve(),
    regionStatusesQueue: Promise.resolve(),
    weaponStatsQueue: Promise.resolve(),
};

const sockets = { alerts: new Set(), active: new Set() };

function registerSocket(tag, ws) {
    sockets[tag].add(ws);
}

function unregisterSocket(tag, ws) {
    sockets[tag].delete(ws);
}

function totalConnections() {
    return sockets.alerts.size + sockets.active.size + neptun.socketCount();
}

function getActiveBody() {
    const cache = state.activeCache;
    return { body: cache ? cache.body : null, fetchedAt: cache ? cache.fetchedAt : null, error: state.activeOriginError };
}

function socketCount(tag) {
    return sockets[tag].size;
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
    return { status, headers: { 'Content-Type': 'application/json', ...extraHeaders }, body };
}

async function ensureActiveCacheFresh({ force = false } = {}) {
    const now = Date.now();
    if (!force && state.activeCache && now - state.activeCache.fetchedAt < ACTIVE_CACHE_TTL_MS) return;

    const run = async () => {
        const waitMs = Math.max(0, ACTIVE_MIN_GAP_MS - (Date.now() - state.lastActiveOriginFetchAt));
        if (waitMs > 0) await lib.delay(waitMs);

        state.lastActiveOriginFetchAt = Date.now();
        state.allAlertsInUaFetchTimestamps.push(state.lastActiveOriginFetchAt);

        const headers = { Authorization: `Bearer ${config.ALERTS_TOKEN}` };
        if (state.activeCache && state.activeCache.lastModified) headers['If-Modified-Since'] = state.activeCache.lastModified;
        const upstream = await fetch(ACTIVE_ALERTS_URL, { headers });

        if (upstream.status === 304 && state.activeCache) {
            state.activeOriginError = null;
            state.activeCache.fetchedAt = Date.now();
            broadcastActive();
            return;
        }

        const body = await upstream.text();

        if (!upstream.ok) {
            state.activeOriginError = { status: upstream.status, body };
            return;
        }

        state.activeOriginError = null;
        const lastModified = upstream.headers.get('Last-Modified');
        state.activeCache = { body, lastModified, fetchedAt: Date.now() };
        try {
            const activeAlerts = JSON.parse(body).alerts || [];
            archive.recordActiveAlerts(activeAlerts);
            trends.recordAlertCount(activeAlerts.length);
        } catch (err) {
            console.error('[archive]', err && err.stack ? err.stack : err);
        }
        broadcastActive();
    };

    const result = state.activeQueue.then(run, run);
    state.activeQueue = result.catch(() => {});
    await result;
}

function broadcastActive() {
    if (!socketCount('active') || !state.activeCache) return;

    const body = state.activeCache.body;
    const unchanged = body === state.lastBroadcastActiveBody;
    const now = Date.now();
    if (unchanged && now - (state.lastActiveBroadcastAt || 0) < ACTIVE_HEARTBEAT_INTERVAL_MS) return;
    state.lastBroadcastActiveBody = body;
    state.lastActiveBroadcastAt = now;

    const message = unchanged ? '{"type":"heartbeat"}' : body;

    sockets.active.forEach((ws) => {
        try {
            ws.send(message);
        } catch (err) {}
    });
}

async function acceptActiveSocket(ws) {
    registerSocket('active', ws);
    await ensureActiveCacheFresh();
    if (state.activeCache) {
        try {
            ws.send(state.activeCache.body);
        } catch (err) {}
    }
}

async function getActive(ifModifiedSince) {
    await ensureActiveCacheFresh();

    if (state.activeOriginError && !state.activeCache) {
        return jsonResponse(state.activeOriginError.body, state.activeOriginError.status);
    }

    const { body, lastModified } = state.activeCache;

    if (ifModifiedSince && lastModified && new Date(ifModifiedSince) >= new Date(lastModified)) {
        return { status: 304, headers: lastModified ? { 'Last-Modified': lastModified } : {}, body: '' };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (lastModified) headers['Last-Modified'] = lastModified;
    if (state.activeOriginError) headers['X-Origin-Error-Status'] = String(state.activeOriginError.status);
    return { status: 200, headers, body };
}

async function getHistory(uid) {
    const now = Date.now();
    const cached = state.historyCache.get(uid);

    if (!cached || now - cached.fetchedAt >= HISTORY_CACHE_TTL_MS) {
        const run = async () => {
            const waitMs = Math.max(0, HISTORY_MIN_GAP_MS - (Date.now() - state.lastHistoryOriginFetchAt));
            if (waitMs > 0) await lib.delay(waitMs);

            state.lastHistoryOriginFetchAt = Date.now();
            state.allAlertsInUaFetchTimestamps.push(state.lastHistoryOriginFetchAt);
            state.historyFetchTimestamps.push(state.lastHistoryOriginFetchAt);
            const upstream = await fetch(`https://api.alerts.in.ua/v1/regions/${uid}/alerts/month_ago.json`, {
                headers: { Authorization: `Bearer ${config.ALERTS_TOKEN}` },
            });
            const body = await upstream.text();

            if (!upstream.ok) {
                state.historyOriginErrors.set(uid, { status: upstream.status, body });
                return;
            }

            state.historyOriginErrors.delete(uid);
            state.historyCache.set(uid, { body, fetchedAt: Date.now() });
            try {
                archive.upsertMany(JSON.parse(body).alerts);
            } catch (err) {
                console.error('[archive]', err && err.stack ? err.stack : err);
            }
        };

        const result = state.historyQueue.then(run, run);
        state.historyQueue = result.catch(() => {});
        await result;
    }

    if (!state.historyCache.has(uid)) {
        const originError = state.historyOriginErrors.get(uid);
        if (originError) return jsonResponse(originError.body, originError.status);
    }

    const { body } = state.historyCache.get(uid);
    const headers = { 'Content-Type': 'application/json' };
    if (state.historyOriginErrors.has(uid)) {
        headers['X-Origin-Error-Status'] = String(state.historyOriginErrors.get(uid).status);
    }
    return { status: 200, headers, body };
}

function archiveUniqueUsersDay(finishedDay) {
    if (!finishedDay || !finishedDay.date) return;
    const history = store.get('uniqueUsersHistory') || [];
    if (history.some((entry) => entry.date === finishedDay.date)) return;
    history.push({ date: finishedDay.date, count: finishedDay.count });
    history.sort((a, b) => (a.date < b.date ? -1 : 1));
    store.put('uniqueUsersHistory', history.slice(-UNIQUE_USERS_HISTORY_MAX_DAYS));
}

uniqueUsers.onDayFinished(archiveUniqueUsersDay);

function recordUniqueUser(ip) {
    if (!ip) return;
    return lib.hashIp(ip).then((hashed) => uniqueUsers.record(hashed));
}

let ukraineAlarmQueue = Promise.resolve();
let ukraineAlarmNextSlotAt = 0;
let ukraineAlarmWaiting = 0;

function ukraineAlarmProjectedWaitMs() {
    return Math.max(0, ukraineAlarmNextSlotAt - Date.now()) + ukraineAlarmWaiting * UKRAINEALARM_REQUEST_GAP_MS;
}

function ukraineAlarmFetch(path, { maxWaitMs = Infinity } = {}) {
    const projectedWaitMs = ukraineAlarmProjectedWaitMs();
    if (projectedWaitMs > maxWaitMs) {
        return Promise.resolve(new Response('Rate limited locally', { status: 429, headers: { 'Retry-After': String(Math.ceil(projectedWaitMs / 1000)) } }));
    }

    ukraineAlarmWaiting++;
    const run = async () => {
        ukraineAlarmWaiting--;
        const waitMs = ukraineAlarmNextSlotAt - Date.now();
        if (waitMs > 0) await lib.delay(waitMs);

        const startedAt = Date.now();
        ukraineAlarmNextSlotAt = startedAt + UKRAINEALARM_REQUEST_GAP_MS;
        state.ukraineAlarmFetchTimestamps.push(startedAt);

        let response;
        try {
            response = await fetch(`${UKRAINEALARM_BASE_URL}${path}`, {
                headers: { Authorization: config.UKRAINEALARM_TOKEN },
                signal: AbortSignal.timeout(UKRAINEALARM_REQUEST_TIMEOUT_MS),
            });
        } catch (err) {
            return new Response(err.message, { status: 502 });
        }

        if (response.status === 429) {
            const retryAfterSec = Number(response.headers.get('retry-after')) || 60;
            ukraineAlarmNextSlotAt = Math.max(ukraineAlarmNextSlotAt, Date.now() + (retryAfterSec + 5) * 1000);
        }
        return response;
    };

    const result = ukraineAlarmQueue.then(run, run);
    ukraineAlarmQueue = result.catch(() => {});
    return result;
}

async function handleUkraineAlarmWebhook(headers, rawBody) {
    const signature = headers['x-webhook-signature'];
    const timestamp = headers['x-webhook-timestamp'];
    const alg = (headers['x-webhook-signature-alg'] || '').toLowerCase();

    const reject = (status, body) => {
        state.ukraineAlarmWebhookStats.rejected++;
        console.warn(`[ukrainealarm-webhook] rejected ${status}: ${body}`);
        return { status, headers: {}, body };
    };

    if (!signature || !timestamp) return reject(400, 'Missing signature headers');
    if (alg && alg !== 'rsa-sha256') return reject(400, 'Unsupported signature algorithm');
    if (!config.UKRAINEALARM_WEBHOOK_PUBLIC_KEY) return reject(503, 'Webhook not configured');

    const timestampMs = Number(timestamp) * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > UKRAINEALARM_WEBHOOK_MAX_TIMESTAMP_AGE_MS) {
        return reject(400, 'Timestamp out of range');
    }

    let verified = false;
    try {
        verified = await lib.verifyUkraineAlarmWebhookSignature(
            config.UKRAINEALARM_WEBHOOK_PUBLIC_KEY,
            signature,
            `${timestamp}.${rawBody}`
        );
    } catch (err) {
        verified = false;
    }
    if (!verified) return reject(401, 'Invalid signature');

    const now = Date.now();
    for (const [hash, seenAt] of state.ukraineAlarmWebhookSeenHashes) {
        if (now - seenAt > UKRAINEALARM_WEBHOOK_DEDUPE_WINDOW_MS) state.ukraineAlarmWebhookSeenHashes.delete(hash);
    }
    const bodyHash = await lib.sha256Hex(rawBody);
    if (state.ukraineAlarmWebhookSeenHashes.has(bodyHash)) {
        return { status: 200, headers: {}, body: 'Duplicate, already processed' };
    }
    state.ukraineAlarmWebhookSeenHashes.set(bodyHash, now);

    store.put('ukraineAlarmLastWebhookPayload', {
        receivedAt: new Date(now).toISOString(),
        body: rawBody.slice(0, 5000),
    });

    let event = null;
    try {
        event = JSON.parse(rawBody);
    } catch (err) {
        event = null;
    }

    state.ukraineAlarmWebhookStats.received++;
    if (event && event.createdAt) {
        const lags = state.ukraineAlarmWebhookStats.lagsMs;
        lags.push(Math.max(0, now - new Date(event.createdAt).getTime()));
        if (lags.length > WEBHOOK_LAG_SAMPLES) lags.shift();
    }
    const lagSec = event && event.createdAt ? Math.round((now - new Date(event.createdAt).getTime()) / 1000) : null;
    console.log(`[ukrainealarm-webhook] ${event ? event.status : 'unparsed'} region=${event ? event.regionId : '-'} type=${event ? event.alarmType : '-'} lag=${lagSec}s`);

    if (event && event.regionId !== undefined && event.alarmType && event.createdAt && Array.isArray(event.activeAlertLevels)) {
        await applyUkraineAlarmEvent(event);
    } else {
        await pollUkraineAlarmIfDue({ maxWaitMs: UKRAINEALARM_ROUTE_MAX_WAIT_MS });
    }

    return { status: 200, headers: {}, body: 'OK' };
}

async function applyUkraineAlarmEvent(event) {
    const saved = store.get('ukraineAlarmState') || {
        lastFetchAt: 0,
        lastFullFetchAt: 0,
        lastActionIndex: null,
        latestAlerts: [],
        observations: [],
    };
    if (!saved.latestAlerts) saved.latestAlerts = [];

    const regionId = String(event.regionId);
    const levels = event.activeAlertLevels;
    let region = saved.latestAlerts.find((r) => String(r.regionId) === regionId);

    if (!region) {
        if (!levels.length) return;
        region = { regionId, regionType: undefined, regionName: undefined, lastUpdate: event.createdAt, activeAlerts: [] };
        saved.latestAlerts.push(region);
    }

    const existing = (region.activeAlerts || []).find((a) => a.type === event.alarmType);
    region.activeAlerts = (region.activeAlerts || []).filter((a) => a.type !== event.alarmType);
    if (levels.length) {
        region.activeAlerts.push({ ...existing, regionId, type: event.alarmType, lastUpdate: event.createdAt, activeAlertLevels: levels });
    }
    region.lastUpdate = event.createdAt;

    if (!region.activeAlerts.length) saved.latestAlerts = saved.latestAlerts.filter((r) => r !== region);

    store.put('ukraineAlarmState', saved);
    broadcastUkraineAlarmAlerts(saved);
}

async function pollUkraineAlarmIfDue({ force = false, maxWaitMs = Infinity } = {}) {
    if (!config.UKRAINEALARM_TOKEN) return;

    const saved = store.get('ukraineAlarmState') || {
        lastFetchAt: 0,
        lastFullFetchAt: 0,
        lastActionIndex: null,
        latestAlerts: null,
        observations: [],
    };

    const now = Date.now();
    if (!force && now - saved.lastFetchAt < UKRAINEALARM_MIN_GAP_MS) return;
    if (ukraineAlarmProjectedWaitMs() > maxWaitMs) return;

    saved.lastFetchAt = now;
    store.put('ukraineAlarmState', saved);

    const alertsResponse = await ukraineAlarmFetch('/alerts', { maxWaitMs });

    const current = store.get('ukraineAlarmState') || saved;
    current.lastFetchAt = now;

    if (alertsResponse.ok) {
        try {
            const alerts = await alertsResponse.json();
            current.latestAlerts = alerts;
            current.lastFullFetchAt = now;
            state.ukraineAlarmOriginError = null;
            recordUkraineAlarmObservations(current, alerts, now);
        } catch (err) {
            state.ukraineAlarmOriginError = { status: 0, body: err.message };
        }
    } else {
        state.ukraineAlarmOriginError = { status: alertsResponse.status, body: (await alertsResponse.text()).slice(0, 200) };
    }

    store.put('ukraineAlarmState', current);
    broadcastUkraineAlarmAlerts(current);
}

function recordUkraineAlarmObservations(saved, alerts, now) {
    const byKey = new Map(saved.observations.map((o) => [`${o.regionId}:${o.alertType}`, o]));

    (alerts || []).forEach((region) => {
        (region.activeAlerts || []).forEach((alert) => {
            const ageMs = now - new Date(alert.lastUpdate).getTime();
            if (ageMs <= UKRAINEALARM_STALE_ALERT_THRESHOLD_MS) return;

            const key = `${region.regionId}:${alert.type}`;
            const existing = byKey.get(key);
            byKey.set(key, {
                firstObservedAt: existing ? existing.firstObservedAt : new Date(now).toISOString(),
                lastObservedAt: new Date(now).toISOString(),
                timesSeen: existing ? existing.timesSeen + 1 : 1,
                regionId: region.regionId,
                regionName: region.regionName,
                alertType: alert.type,
                lastUpdate: alert.lastUpdate,
                ageDays: Math.round(ageMs / (24 * 60 * 60 * 1000)),
            });
        });
    });

    saved.observations = Array.from(byKey.values())
        .sort((a, b) => new Date(b.lastObservedAt) - new Date(a.lastObservedAt))
        .slice(0, UKRAINEALARM_MAX_OBSERVATIONS);
}

function buildUkraineAlarmAlertsBody(saved) {
    const now = Date.now();

    const alerts = [];
    (saved && saved.latestAlerts ? saved.latestAlerts : []).forEach((region) => {
        (region.activeAlerts || []).forEach((alert) => {
            const mappedType = lib.UKRAINEALARM_TYPE_MAP[alert.type];
            if (!mappedType || lib.UKRAINEALARM_IGNORED_REGION_IDS.has(String(region.regionId))) return;

            const ageMs = now - new Date(alert.lastUpdate).getTime();
            if (ageMs > UKRAINEALARM_STALE_ALERT_THRESHOLD_MS) return;

            const activeAlertLevels = alert.activeAlertLevels || [];

            alerts.push({
                id: `ukrainealarm-${region.regionId}-${mappedType}`,
                location_uid: lib.ukraineAlarmUid(region.regionId),
                location_title: region.regionName,
                alert_type: mappedType,
                started_at: alert.lastUpdate,
                alert_level: lib.worstUkraineAlarmLevel(activeAlertLevels),
                threats: lib.mapUkraineAlarmThreats(activeAlertLevels),
            });
        });
    });

    return JSON.stringify({ alerts });
}

function broadcastUkraineAlarmAlerts(saved) {
    if (!socketCount('alerts')) return;

    const body = buildUkraineAlarmAlertsBody(saved);
    const unchanged = body === state.lastBroadcastAlertsBody;
    state.lastBroadcastAlertsBody = body;

    const message = unchanged ? '{"type":"heartbeat"}' : body;

    sockets.alerts.forEach((ws) => {
        try {
            ws.send(message);
        } catch (err) {}
    });
}

function acceptAlertsSocket(ws) {
    registerSocket('alerts', ws);
    const saved = store.get('ukraineAlarmState');
    try {
        ws.send(buildUkraineAlarmAlertsBody(saved));
    } catch (err) {}
}

function isUkraineAlarmUnavailable() {
    const saved = store.get('ukraineAlarmState');
    return !config.UKRAINEALARM_TOKEN && !(saved && saved.lastFetchAt);
}

async function getUkraineAlarmAlerts() {
    if (isUkraineAlarmUnavailable()) {
        return jsonResponse(JSON.stringify({ error: 'UkraineAlarm is not configured on the server' }), 503);
    }
    try {
        await pollUkraineAlarmIfDue({ maxWaitMs: UKRAINEALARM_ROUTE_MAX_WAIT_MS });
    } catch (err) {
        state.ukraineAlarmOriginError = { status: 0, body: err.message };
    }

    const saved = store.get('ukraineAlarmState');
    return jsonResponse(buildUkraineAlarmAlertsBody(saved));
}

async function fetchUkraineAlarmDateHistory(dateKey) {
    const response = await ukraineAlarmFetch(`/alerts/dateHistory?date=${dateKey.replace(/-/g, '')}`, { maxWaitMs: UKRAINEALARM_ROUTE_MAX_WAIT_MS });

    if (!response.ok) {
        return { error: { status: response.status, body: await response.text() } };
    }

    const raw = await response.json();
    const alerts = raw
        .filter((record) => lib.UKRAINEALARM_TYPE_MAP[record.alertType])
        .filter((record) => lib.parseDotNetDurationMs(record.duration) <= UKRAINEALARM_TODAY_MAX_DURATION_MS)
        .map((record) => ({
            id: `ukrainealarm-${record.regionId}-${record.startDate}`,
            location_uid: lib.ukraineAlarmUid(record.regionId),
            location_title: record.regionName,
            alert_type: lib.UKRAINEALARM_TYPE_MAP[record.alertType],
            started_at: record.startDate,
            finished_at: new Date(new Date(record.startDate).getTime() + lib.parseDotNetDurationMs(record.duration)).toISOString(),
        }));

    return { alerts };
}

function loadUkraineAlarmTodayState() {
    return (
        store.get('ukraineAlarmTodayState') || {
            attemptDate: null,
            failCount: 0,
            lastAttemptAt: 0,
            cache: null,
            originError: null,
        }
    );
}

async function getUkraineAlarmTodayStats() {
    const todayKey = lib.kyivDateKey(new Date());
    const now = Date.now();

    let today = loadUkraineAlarmTodayState();
    if (today.attemptDate !== todayKey) {
        today = { attemptDate: todayKey, failCount: 0, lastAttemptAt: 0, cache: today.cache, originError: null };
    }

    const cacheStale =
        !today.cache || today.cache.date !== todayKey || now - today.cache.fetchedAt >= UKRAINEALARM_TODAY_CACHE_TTL_MS;

    const backingOff = today.failCount >= UKRAINEALARM_TODAY_BACKOFF_THRESHOLD;
    const retryGapMs = backingOff ? UKRAINEALARM_TODAY_BACKOFF_MS : UKRAINEALARM_TODAY_CACHE_TTL_MS;
    const dueForRetry = now - today.lastAttemptAt >= retryGapMs;

    if (cacheStale && dueForRetry) {
        today.lastAttemptAt = now;
        const result = await fetchUkraineAlarmDateHistory(todayKey);
        if (result.error) {
            today.originError = result.error;
            today.failCount++;
        } else {
            today.originError = null;
            today.failCount = 0;
            today.cache = { date: todayKey, alerts: result.alerts, fetchedAt: now };
        }
        store.put('ukraineAlarmTodayState', today);
    }

    if (today.originError && !today.cache) {
        return jsonResponse(JSON.stringify({ error: today.originError }), today.originError.status || 502);
    }

    return jsonResponse(
        JSON.stringify({ date: today.cache.date, alerts: today.cache.alerts, complete: true, warmupEtaMinutes: 0 })
    );
}

async function getUkraineAlarmDateStats(dateParam) {
    const dateKey = `${dateParam.slice(0, 4)}-${dateParam.slice(4, 6)}-${dateParam.slice(6, 8)}`;

    if (!state.ukraineAlarmDateStatsCache.has(dateKey)) {
        const result = await fetchUkraineAlarmDateHistory(dateKey);
        if (result.error) {
            return jsonResponse(JSON.stringify({ error: result.error }), result.error.status || 502);
        }
        state.ukraineAlarmDateStatsCache.set(dateKey, result.alerts);
    }

    return jsonResponse(JSON.stringify({ date: dateKey, alerts: state.ukraineAlarmDateStatsCache.get(dateKey) }));
}

async function getUkraineAlarmRegionHistory(regionId) {
    const now = Date.now();
    const cached = state.ukraineAlarmRegionHistoryCache.get(regionId);

    if (!cached || now - cached.fetchedAt >= HISTORY_CACHE_TTL_MS) {
        try {
            const response = await ukraineAlarmFetch(`/alerts/regionHistory?regionId=${regionId}`, { maxWaitMs: UKRAINEALARM_ROUTE_MAX_WAIT_MS });

            if (!response.ok) {
                state.ukraineAlarmRegionHistoryOriginErrors.set(regionId, { status: response.status, body: await response.text() });
            } else {
                const raw = await response.json();

                const records = (raw && raw[0] && raw[0].alarms) || [];
                const alerts = records
                    .filter((record) => lib.UKRAINEALARM_TYPE_MAP[record.alertType])
                    .filter((record) => lib.parseDotNetDurationMs(record.duration) <= UKRAINEALARM_TODAY_MAX_DURATION_MS)
                    .map((record) => ({
                        id: `ukrainealarm-${regionId}-${record.startDate}`,
                        location_uid: Number(regionId),
                        location_title: record.regionName,
                        alert_type: lib.UKRAINEALARM_TYPE_MAP[record.alertType],
                        started_at: record.startDate,
                        finished_at: new Date(
                            new Date(record.startDate).getTime() + lib.parseDotNetDurationMs(record.duration)
                        ).toISOString(),
                    }));

                state.ukraineAlarmRegionHistoryOriginErrors.delete(regionId);
                state.ukraineAlarmRegionHistoryCache.set(regionId, { alerts, fetchedAt: now });
            }
        } catch (err) {
            state.ukraineAlarmRegionHistoryOriginErrors.set(regionId, { status: 0, body: err.message });
        }
    }

    if (!state.ukraineAlarmRegionHistoryCache.has(regionId)) {
        const originError = state.ukraineAlarmRegionHistoryOriginErrors.get(regionId);
        if (originError) return jsonResponse(JSON.stringify({ error: originError }), originError.status || 502);
    }

    return jsonResponse(JSON.stringify({ alerts: state.ukraineAlarmRegionHistoryCache.get(regionId).alerts }));
}

function summarizeWebhookStats() {
    const stats = state.ukraineAlarmWebhookStats;
    const sorted = [...stats.lagsMs].sort((a, b) => a - b);
    const pick = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
    return {
        sinceMs: Date.now() - stats.startedAt,
        received: stats.received,
        rejected: stats.rejected,
        samples: sorted.length,
        lagMs: { p50: pick(0.5), p90: pick(0.9), max: sorted.length ? sorted[sorted.length - 1] : null },
    };
}

async function getUkraineAlarmStatus() {
    const now = Date.now();
    const saved = store.get('ukraineAlarmState') || null;
    const requestsLastMinute = lib.pruneAndCount(state.ukraineAlarmFetchTimestamps, now, LOAD_WINDOW_MS);
    const lastWebhookPayload = store.get('ukraineAlarmLastWebhookPayload');

    return jsonResponse(
        JSON.stringify({
            generatedAt: new Date(now).toISOString(),
            configured: Boolean(config.UKRAINEALARM_TOKEN),
            requestsLastMinute,
            minGapMs: UKRAINEALARM_MIN_GAP_MS,
            lastFetchAgeMs: saved ? now - saved.lastFetchAt : null,
            lastFullFetchAgeMs: saved && saved.lastFullFetchAt ? now - saved.lastFullFetchAt : null,
            lastActionIndex: saved ? saved.lastActionIndex : null,
            currentActiveAlertCount: saved && saved.latestAlerts ? saved.latestAlerts.length : null,
            staleAlertObservations: saved ? saved.observations : [],
            currentError: state.ukraineAlarmOriginError,
            webhookConfigured: Boolean(config.UKRAINEALARM_WEBHOOK_PUBLIC_KEY),
            webhookStats: summarizeWebhookStats(),
            lastWebhookPayload,
        })
    );
}

function loadTodayStatsState() {
    const todayKey = lib.kyivDateKey(new Date());
    let saved = store.get('todayStatsState');
    if (!saved || saved.date !== todayKey) {
        saved = { date: todayKey, cursor: 0, byOblast: {} };
        store.put('todayStatsState', saved);
    }
    return saved;
}

async function refreshOneOblastForToday() {
    if (!config.ALERTS_TOKEN) return;

    const todayState = loadTodayStatsState();
    const uid = lib.ALL_OBLAST_UIDS[todayState.cursor % lib.ALL_OBLAST_UIDS.length];
    todayState.cursor += 1;

    const response = await getHistory(String(uid));
    if (response.status === 200) {
        const data = JSON.parse(response.body);
        const alerts = (data.alerts || []).filter(
            (alert) => alert.started_at && lib.kyivDateKey(new Date(alert.started_at)) === todayState.date
        );
        todayState.byOblast[uid] = alerts;
    }

    store.put('todayStatsState', todayState);
}

function getTodayStats() {
    const todayState = loadTodayStatsState();
    const allAlerts = Object.values(todayState.byOblast).flat();

    const byHour = Array.from({ length: 24 }, () => 0);
    const byOblast = new Map();
    allAlerts.forEach((alert) => {
        byHour[lib.kyivHour(alert.started_at)]++;
        if (alert.location_oblast) {
            byOblast.set(alert.location_oblast, (byOblast.get(alert.location_oblast) || 0) + 1);
        }
    });

    const oblastsRemaining = Math.max(0, lib.ALL_OBLAST_UIDS.length - todayState.cursor);
    const complete = oblastsRemaining === 0;
    const warmupEtaMinutes = complete ? 0 : Math.ceil((oblastsRemaining * TODAY_STATS_REFRESH_INTERVAL_MS) / 60000);

    return jsonResponse(
        JSON.stringify({
            date: todayState.date,
            total: allAlerts.length,
            byHour,
            byOblast: Array.from(byOblast, ([oblast, count]) => ({ oblast, count })).sort((a, b) => b.count - a.count),
            alerts: allAlerts,
            complete,
            warmupEtaMinutes,
        })
    );
}

function buildStatus() {
    const now = Date.now();
    const ageOrNull = (ts) => (ts ? now - ts : null);
    const percentOf = (count, limit) => Math.round((count / limit) * 100);

    const todayState = loadTodayStatsState();
    const oblastsRemaining = Math.max(0, lib.ALL_OBLAST_UIDS.length - todayState.cursor);
    const ukraineAlarmTodayState = loadUkraineAlarmTodayState();
    const uniqueCounts = uniqueUsers.counts();

    const generalRequestsLastMinute = lib.pruneAndCount(state.allAlertsInUaFetchTimestamps, now, LOAD_WINDOW_MS);
    const historyRequestsLastMinute = lib.pruneAndCount(state.historyFetchTimestamps, now, LOAD_WINDOW_MS);

    const status = {
            generatedAt: new Date(now).toISOString(),
            active: {
                softLimitPerMinute: 9,
                hardLimitPerMinute: 12,
                requestsLastMinute: generalRequestsLastMinute,
                percentOfSoftLimit: percentOf(generalRequestsLastMinute, 9),
                percentOfHardLimit: percentOf(generalRequestsLastMinute, 12),
                minGapMs: ACTIVE_MIN_GAP_MS,
                cacheTtlMs: ACTIVE_CACHE_TTL_MS,
                lastOriginFetchAgeMs: ageOrNull(state.lastActiveOriginFetchAt),
                cacheAgeMs: state.activeCache ? now - state.activeCache.fetchedAt : null,
                currentError: state.activeOriginError,
            },
            history: {
                limitPerMinute: 2,
                requestsLastMinute: historyRequestsLastMinute,
                percentOfLimit: percentOf(historyRequestsLastMinute, 2),
                minGapMs: HISTORY_MIN_GAP_MS,
                cacheTtlMs: HISTORY_CACHE_TTL_MS,
                lastOriginFetchAgeMs: ageOrNull(state.lastHistoryOriginFetchAt),
                cachedUidCount: state.historyCache.size,
                currentErrors: Object.fromEntries(state.historyOriginErrors),
            },
            regionStatuses: {
                minGapMs: REGION_STATUSES_MIN_GAP_MS,
                cacheTtlMs: REGION_STATUSES_CACHE_TTL_MS,
                lastOriginFetchAgeMs: ageOrNull(state.lastRegionStatusesOriginFetchAt),
                cacheAgeMs: state.regionStatusesCache ? now - state.regionStatusesCache.fetchedAt : null,
                currentError: state.regionStatusesOriginError,
            },
            weaponStats: {
                cacheTtlMs: WEAPON_STATS_CACHE_TTL_MS,
                lastOriginFetchAgeMs: ageOrNull(state.lastWeaponStatsOriginFetchAt),
                cacheAgeMs: state.weaponStatsCache ? now - state.weaponStatsCache.fetchedAt : null,
                currentError: state.weaponStatsOriginError,
            },
            todayStats: {
                date: todayState.date,
                oblastsCovered: lib.ALL_OBLAST_UIDS.length - oblastsRemaining,
                oblastsTotal: lib.ALL_OBLAST_UIDS.length,
                complete: oblastsRemaining === 0,
                refreshIntervalMs: TODAY_STATS_REFRESH_INTERVAL_MS,
            },
            ukraineAlarmTodayStats: {
                date: ukraineAlarmTodayState.attemptDate,
                hasCache: Boolean(ukraineAlarmTodayState.cache && ukraineAlarmTodayState.cache.date === ukraineAlarmTodayState.attemptDate),
                lastOriginFetchAgeMs: ageOrNull(ukraineAlarmTodayState.lastAttemptAt),
                consecutiveFailures: ukraineAlarmTodayState.failCount,
                backingOff: ukraineAlarmTodayState.failCount >= UKRAINEALARM_TODAY_BACKOFF_THRESHOLD,
                retryIntervalMs:
                    ukraineAlarmTodayState.failCount >= UKRAINEALARM_TODAY_BACKOFF_THRESHOLD
                        ? UKRAINEALARM_TODAY_BACKOFF_MS
                        : UKRAINEALARM_TODAY_CACHE_TTL_MS,
                currentError: ukraineAlarmTodayState.originError,
            },
            uniqueUsers: {
                date: uniqueCounts.date,
                allTime: uniqueCounts.allTime,
                today: uniqueCounts.today,
                history: store.get('uniqueUsersHistory') || [],
            },
            system: system.getSystemMetrics(),
            connections: {
                alerts: socketCount('alerts'),
                active: socketCount('active'),
                neptun: neptun.socketCount(),
                users: ratelimit.connectedClientCount(),
            },
            neptun: neptun.getStatusInfo(),
            occupied: occupied.getStatusInfo(),
            geoip: geoip.getStatusInfo(),
            publicApi: require('./publicApi').getStatusInfo(),
            ukraineAlarm: { snapshotAgeMs: ageOrNull((store.get('ukraineAlarmState') || {}).lastFullFetchAt) },
            backfill: { complete: trends.isBackfillComplete() },
            peaks: trends.getDailyPeaks(),
            archive: archive.getStats(),
            backup: backup.getStatusInfo(),
            log: logbook.getCounts(),
    };

    status.health = health.evaluate(status, {
        alertsConfigured: Boolean(config.ALERTS_TOKEN),
        ukraineAlarmConfigured: Boolean(config.UKRAINEALARM_TOKEN),
    });
    return status;
}

function getStatus() {
    return jsonResponse(JSON.stringify(buildStatus()));
}

function checkHealth() {
    if (process.uptime() < 90) return;
    health.logTransitions(buildStatus().health);
}

async function getRegionStatuses() {
    const now = Date.now();

    if (!state.regionStatusesCache || now - state.regionStatusesCache.fetchedAt >= REGION_STATUSES_CACHE_TTL_MS) {
        const run = async () => {
            const waitMs = Math.max(0, REGION_STATUSES_MIN_GAP_MS - (Date.now() - state.lastRegionStatusesOriginFetchAt));
            if (waitMs > 0) await lib.delay(waitMs);

            state.lastRegionStatusesOriginFetchAt = Date.now();
            state.allAlertsInUaFetchTimestamps.push(state.lastRegionStatusesOriginFetchAt);
            const upstream = await fetch(REGION_STATUSES_URL, {
                headers: { Authorization: `Bearer ${config.ALERTS_TOKEN}` },
            });
            const body = await upstream.text();

            if (!upstream.ok) {
                state.regionStatusesOriginError = { status: upstream.status, body };
                return;
            }

            state.regionStatusesOriginError = null;
            state.regionStatusesCache = { body, fetchedAt: Date.now() };
        };

        const result = state.regionStatusesQueue.then(run, run);
        state.regionStatusesQueue = result.catch(() => {});
        await result;
    }

    if (state.regionStatusesOriginError && !state.regionStatusesCache) {
        return jsonResponse(state.regionStatusesOriginError.body, state.regionStatusesOriginError.status);
    }

    const headers = { 'Content-Type': 'application/json' };
    if (state.regionStatusesOriginError) headers['X-Origin-Error-Status'] = String(state.regionStatusesOriginError.status);
    return { status: 200, headers, body: state.regionStatusesCache.body };
}

async function getWeaponStats() {
    const now = Date.now();

    if (!state.weaponStatsCache || now - state.weaponStatsCache.fetchedAt >= WEAPON_STATS_CACHE_TTL_MS) {
        const run = async () => {
            const waitMs = Math.max(0, WEAPON_STATS_MIN_GAP_MS - (Date.now() - state.lastWeaponStatsOriginFetchAt));
            if (waitMs > 0) await lib.delay(waitMs);
            state.lastWeaponStatsOriginFetchAt = Date.now();

            try {
                const [attacks, models] = await Promise.all([
                    lib.fetchKaggleCsv(config.KAGGLE_TOKEN, config.KAGGLE_USERNAME, config.KAGGLE_KEY, KAGGLE_DATASET, KAGGLE_ATTACKS_FILE),
                    lib.fetchKaggleCsv(config.KAGGLE_TOKEN, config.KAGGLE_USERNAME, config.KAGGLE_KEY, KAGGLE_DATASET, KAGGLE_MODELS_FILE),
                ]);
                const stats = lib.buildWeaponStats(attacks, models, WEAPON_STATS_TOP_MODELS);
                state.weaponStatsOriginError = null;
                state.weaponStatsCache = { body: JSON.stringify(stats), fetchedAt: Date.now() };
            } catch (err) {
                state.weaponStatsOriginError = { status: 502, body: err.message };
            }
        };

        const result = state.weaponStatsQueue.then(run, run);
        state.weaponStatsQueue = result.catch(() => {});
        await result;
    }

    if (state.weaponStatsOriginError && !state.weaponStatsCache) {
        return { status: state.weaponStatsOriginError.status, headers: {}, body: state.weaponStatsOriginError.body };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (state.weaponStatsOriginError) headers['X-Origin-Error-Status'] = String(state.weaponStatsOriginError.status);
    return { status: 200, headers, body: state.weaponStatsCache.body };
}

module.exports = {
    getActiveBody,
    isUkraineAlarmUnavailable,
    checkHealth,
    totalConnections,
    registerSocket,
    unregisterSocket,
    socketCount,
    ACTIVE_POLL_INTERVAL_MS,
    acceptActiveSocket,
    acceptAlertsSocket,
    getActive,
    getHistory,
    recordUniqueUser,
    handleUkraineAlarmWebhook,
    pollUkraineAlarmIfDue,
    ensureActiveCacheFresh,
    getUkraineAlarmAlerts,
    getUkraineAlarmTodayStats,
    getUkraineAlarmDateStats,
    getUkraineAlarmRegionHistory,
    getUkraineAlarmStatus,
    refreshOneOblastForToday,
    getTodayStats,
    getStatus,
    getRegionStatuses,
    getWeaponStats,
};

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const ACTIVE_ALERTS_URL = 'https://api.alerts.in.ua/v1/alerts/active.json';
const ACTIVE_CACHE_TTL_MS = 30 * 1000;
const ACTIVE_MIN_GAP_MS = 5 * 1000;

const HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const HISTORY_MIN_GAP_MS = 35 * 1000;

const ALL_OBLAST_UIDS = [
    3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31,
];

const TODAY_STATS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TODAY_STATS_TIMEZONE = 'Europe/Kyiv';

function kyivDateKey(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TODAY_STATS_TIMEZONE }).format(date);
}

function kyivHour(dateStr) {
    const formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone: TODAY_STATS_TIMEZONE,
        hour: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(dateStr));
    return Number(formatted);
}

async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function hashIp(ip) {
    return (await sha256Hex(ip)).slice(0, 16);
}

async function importUkraineAlarmWebhookPublicKey(pem) {
    const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----/, '').replace(/-----END PUBLIC KEY-----/, '').replace(/\s+/g, '');
    const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('spki', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function verifyUkraineAlarmWebhookSignature(publicKeyPem, signatureBase64, canonicalString) {
    const key = await importUkraineAlarmWebhookPublicKey(publicKeyPem);
    const signatureBytes = Uint8Array.from(atob(signatureBase64), (c) => c.charCodeAt(0));
    const dataBytes = new TextEncoder().encode(canonicalString);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, dataBytes);
}

const LOAD_WINDOW_MS = 60 * 1000;

function pruneAndCount(timestamps, now) {
    while (timestamps.length && now - timestamps[0] > LOAD_WINDOW_MS) timestamps.shift();
    return timestamps.length;
}

const REGION_STATUSES_URL = 'https://api.alerts.in.ua/v1/iot/active_air_raid_alerts.json';
const REGION_STATUSES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REGION_STATUSES_MIN_GAP_MS = 5 * 1000;

const UKRAINEALARM_BASE_URL = 'https://api.ukrainealarm.com/api/v3';
const UKRAINEALARM_MIN_GAP_MS = 3 * 60 * 1000;
const UKRAINEALARM_FORCE_REFRESH_MS = 20 * 60 * 1000;
const UKRAINEALARM_STALE_ALERT_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const UKRAINEALARM_MAX_OBSERVATIONS = 30;

const UKRAINEALARM_WEBHOOK_PATH = '/webhook/ukrainealarm/x1fP-zwrLYGX0KsseCw_uB8CdR4cOjKU';

const UKRAINEALARM_WEBHOOK_MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;
const UKRAINEALARM_WEBHOOK_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

const UKRAINEALARM_TODAY_CACHE_TTL_MS = 2 * 60 * 1000;

const UKRAINEALARM_TODAY_MAX_DURATION_MS = 24 * 60 * 60 * 1000;

function parseDotNetDurationMs(duration) {
    const dotIndex = duration.indexOf('.');
    const hasDayPrefix = dotIndex !== -1 && duration.slice(0, dotIndex).match(/^\d+$/) && duration.includes(':');
    const days = hasDayPrefix ? Number(duration.slice(0, dotIndex)) : 0;
    const rest = hasDayPrefix ? duration.slice(dotIndex + 1) : duration;
    const [hours, minutes, secondsPart] = rest.split(':');
    const seconds = parseFloat(secondsPart) || 0;
    return (((days * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + seconds) * 1000;
}

const UKRAINEALARM_TYPE_MAP = {
    AIR: 'air_raid',
    ARTILLERY: 'artillery_shelling',
    URBAN_FIGHTS: 'urban_fights',
    CHEMICAL: 'chemical',
    NUCLEAR: 'nuclear',
};

function worstUkraineAlarmLevel(activeAlertLevels) {
    if (activeAlertLevels.some((l) => (l.alertLevel || '').toLowerCase() === 'red')) return 'red';
    if (activeAlertLevels.length) return 'yellow';
    return null;
}

function mapUkraineAlarmThreats(activeAlertLevels) {
    return activeAlertLevels.map((l) => ({
        threat_type: null,
        level: l.alertLevel ? l.alertLevel.toLowerCase() : null,
        started_at: l.createdAt || null,
        source_message: l.reason || null,
    }));
}

const KAGGLE_DATASET = 'piterfm/massive-missile-attacks-on-ukraine';
const KAGGLE_ATTACKS_FILE = 'missile_attacks_daily.csv';
const KAGGLE_MODELS_FILE = 'missiles_and_uavs.csv';
const WEAPON_STATS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WEAPON_STATS_TOP_MODELS = 20;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else {
            field += ch;
        }
    }
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }

    const header = rows[0];
    return rows.slice(1).map((cells) => {
        const record = {};
        header.forEach((key, index) => (record[key] = cells[index]));
        return record;
    });
}

async function fetchKaggleCsv(env, fileName) {
    const auth = btoa(`${env.KAGGLE_USERNAME}:${env.KAGGLE_KEY}`);
    const url = `https://www.kaggle.com/api/v1/datasets/download/${KAGGLE_DATASET}?file_name=${fileName}`;
    const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!response.ok) {
        throw new Error(`Kaggle ${fileName}: ${response.status} ${await response.text()}`);
    }
    return parseCsv(await response.text());
}

function buildWeaponStats(attacks, models) {
    const categoryByModel = new Map(models.map((m) => [m.model, m.category || 'unknown']));

    const totals = { launched: 0, destroyed: 0 };
    const byCategory = new Map();
    const byModel = new Map();
    const byMonth = new Map();
    let minDate = null;
    let maxDate = null;

    attacks.forEach((row) => {
        const launched = Number(row.launched) || 0;
        const destroyed = Number(row.destroyed) || 0;
        const model = row.model || 'Unknown';
        const category = categoryByModel.get(model) || 'unknown';
        const dateStr = (row.time_start || '').slice(0, 10);
        const month = dateStr.slice(0, 7);
        if (!dateStr) return;

        if (!minDate || dateStr < minDate) minDate = dateStr;
        if (!maxDate || dateStr > maxDate) maxDate = dateStr;

        totals.launched += launched;
        totals.destroyed += destroyed;

        if (!byCategory.has(category)) byCategory.set(category, { category, launched: 0, destroyed: 0 });
        const categoryEntry = byCategory.get(category);
        categoryEntry.launched += launched;
        categoryEntry.destroyed += destroyed;

        if (!byModel.has(model)) byModel.set(model, { model, category, launched: 0, destroyed: 0 });
        const modelEntry = byModel.get(model);
        modelEntry.launched += launched;
        modelEntry.destroyed += destroyed;

        if (!byMonth.has(month)) byMonth.set(month, { month, launched: 0, destroyed: 0, categories: {} });
        const monthEntry = byMonth.get(month);
        monthEntry.launched += launched;
        monthEntry.destroyed += destroyed;
        monthEntry.categories[category] = (monthEntry.categories[category] || 0) + launched;
    });

    return {
        generatedAt: new Date().toISOString(),
        dateRange: { from: minDate, to: maxDate },
        totals,
        byCategory: Array.from(byCategory.values()).sort((a, b) => b.launched - a.launched),
        byModel: Array.from(byModel.values())
            .sort((a, b) => b.launched - a.launched)
            .slice(0, WEAPON_STATS_TOP_MODELS),
        monthly: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
    };
}

export class AlertsGateway {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.activeCache = null;
        this.activeOriginError = null;
        this.historyCache = new Map();
        this.historyOriginErrors = new Map();
        this.regionStatusesCache = null;
        this.regionStatusesOriginError = null;
        this.weaponStatsCache = null;
        this.weaponStatsOriginError = null;
        this.lastActiveOriginFetchAt = 0;
        this.lastHistoryOriginFetchAt = 0;
        this.lastRegionStatusesOriginFetchAt = 0;
        this.lastWeaponStatsOriginFetchAt = 0;

        this.allAlertsInUaFetchTimestamps = [];
        this.historyFetchTimestamps = [];
        this.ukraineAlarmFetchTimestamps = [];
        this.ukraineAlarmOriginError = null;
        this.ukraineAlarmTodayCache = null;
        this.ukraineAlarmTodayOriginError = null;

        this.ukraineAlarmDateStatsCache = new Map();
        this.ukraineAlarmRegionHistoryCache = new Map();
        this.ukraineAlarmRegionHistoryOriginErrors = new Map();

        this.ukraineAlarmWebhookSeenHashes = new Map();
        this.ukraineAlarmWebhookPublicKey = null;
        this.lastBroadcastAlertsBody = null;
        this.activeQueue = Promise.resolve();
        this.historyQueue = Promise.resolve();
        this.regionStatusesQueue = Promise.resolve();
        this.weaponStatsQueue = Promise.resolve();
    }

    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
            return this.acceptAlertsWebSocket();
        }

        if (url.pathname === UKRAINEALARM_WEBHOOK_PATH) {
            return this.handleUkraineAlarmWebhook(request);
        }

        await this.ensureTodayStatsAlarmScheduled();
        await this.recordUniqueUser(request);

        const ifModifiedSince = request.headers.get('If-Modified-Since');

        const historyMatch = url.pathname.match(/^\/history\/(\d+)$/);
        if (historyMatch) {
            return this.getHistory(historyMatch[1]);
        }

        if (url.pathname === '/region-statuses') {
            return this.getRegionStatuses();
        }

        if (url.pathname === '/today-stats') {
            return this.getTodayStats();
        }

        if (url.pathname === '/weapon-stats') {
            return this.getWeaponStats();
        }

        if (url.pathname === '/status') {
            return this.getStatus();
        }

        if (url.pathname === '/ukrainealarm-status') {
            return this.getUkraineAlarmStatus();
        }

        if (url.pathname === '/ukrainealarm-alerts') {
            return this.getUkraineAlarmAlerts();
        }

        if (url.pathname === '/ukrainealarm-today-stats') {
            return this.getUkraineAlarmTodayStats();
        }

        const ukraineAlarmDateStatsMatch = url.pathname.match(/^\/ukrainealarm-date-stats\/(\d{8})$/);
        if (ukraineAlarmDateStatsMatch) {
            return this.getUkraineAlarmDateStats(ukraineAlarmDateStatsMatch[1]);
        }

        const ukraineAlarmRegionHistoryMatch = url.pathname.match(/^\/ukrainealarm-region-history\/(\d+)$/);
        if (ukraineAlarmRegionHistoryMatch) {
            return this.getUkraineAlarmRegionHistory(ukraineAlarmRegionHistoryMatch[1]);
        }

        return this.getActive(ifModifiedSince);
    }

    async getActive(ifModifiedSince) {
        const now = Date.now();

        if (!this.activeCache || now - this.activeCache.fetchedAt >= ACTIVE_CACHE_TTL_MS) {
            const run = async () => {
                const waitMs = Math.max(0, ACTIVE_MIN_GAP_MS - (Date.now() - this.lastActiveOriginFetchAt));
                if (waitMs > 0) await delay(waitMs);

                this.lastActiveOriginFetchAt = Date.now();
                this.allAlertsInUaFetchTimestamps.push(this.lastActiveOriginFetchAt);
                const upstream = await fetch(ACTIVE_ALERTS_URL, {
                    headers: { Authorization: `Bearer ${this.env.ALERTS_TOKEN}` },
                });
                const body = await upstream.text();

                if (!upstream.ok) {
                    this.activeOriginError = { status: upstream.status, body };
                    return;
                }

                this.activeOriginError = null;
                const lastModified = upstream.headers.get('Last-Modified');
                this.activeCache = { body, lastModified, fetchedAt: Date.now() };
            };

            const result = this.activeQueue.then(run, run);
            this.activeQueue = result.catch(() => {});
            await result;
        }

        if (this.activeOriginError && !this.activeCache) {
            return new Response(this.activeOriginError.body, {
                status: this.activeOriginError.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const { body, lastModified } = this.activeCache;

        if (ifModifiedSince && lastModified && new Date(ifModifiedSince) >= new Date(lastModified)) {
            return new Response(null, { status: 304, headers: lastModified ? { 'Last-Modified': lastModified } : {} });
        }

        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (lastModified) headers.set('Last-Modified', lastModified);
        if (this.activeOriginError) headers.set('X-Origin-Error-Status', String(this.activeOriginError.status));
        return new Response(body, { headers });
    }

    async getHistory(uid) {
        const now = Date.now();
        const cached = this.historyCache.get(uid);

        if (!cached || now - cached.fetchedAt >= HISTORY_CACHE_TTL_MS) {
            const run = async () => {
                const waitMs = Math.max(0, HISTORY_MIN_GAP_MS - (Date.now() - this.lastHistoryOriginFetchAt));
                if (waitMs > 0) await delay(waitMs);

                this.lastHistoryOriginFetchAt = Date.now();
                this.allAlertsInUaFetchTimestamps.push(this.lastHistoryOriginFetchAt);
                this.historyFetchTimestamps.push(this.lastHistoryOriginFetchAt);
                const upstream = await fetch(`https://api.alerts.in.ua/v1/regions/${uid}/alerts/month_ago.json`, {
                    headers: { Authorization: `Bearer ${this.env.ALERTS_TOKEN}` },
                });
                const body = await upstream.text();

                if (!upstream.ok) {
                    this.historyOriginErrors.set(uid, { status: upstream.status, body });
                    return;
                }

                this.historyOriginErrors.delete(uid);
                this.historyCache.set(uid, { body, fetchedAt: Date.now() });
            };

            const result = this.historyQueue.then(run, run);
            this.historyQueue = result.catch(() => {});
            await result;
        }

        if (!this.historyCache.has(uid)) {
            const originError = this.historyOriginErrors.get(uid);
            if (originError) {
                return new Response(originError.body, {
                    status: originError.status,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }

        const { body } = this.historyCache.get(uid);
        const headers = { 'Content-Type': 'application/json' };
        if (this.historyOriginErrors.has(uid)) {
            headers['X-Origin-Error-Status'] = String(this.historyOriginErrors.get(uid).status);
        }
        return new Response(body, { headers });
    }

    async ensureTodayStatsAlarmScheduled() {
        const current = await this.state.storage.getAlarm();
        if (current === null) {
            await this.state.storage.setAlarm(Date.now());
        }
    }

    async recordUniqueUser(request) {
        const ip = request.headers.get('CF-Connecting-IP');
        if (!ip) return;
        const hashed = await hashIp(ip);

        const todayKey = kyivDateKey(new Date());
        let daily = await this.state.storage.get('uniqueUsersState');
        if (!daily || daily.date !== todayKey) {
            daily = { date: todayKey, hashedIps: [] };
        }
        if (!daily.hashedIps.includes(hashed)) {
            daily.hashedIps.push(hashed);
            await this.state.storage.put('uniqueUsersState', daily);
        }

        let allTime = await this.state.storage.get('allTimeUniqueUsersState');
        if (!allTime) allTime = { hashedIps: [] };
        if (!allTime.hashedIps.includes(hashed)) {
            allTime.hashedIps.push(hashed);
            await this.state.storage.put('allTimeUniqueUsersState', allTime);
        }
    }

    async alarm() {
        try {
            await this.refreshOneOblastForToday();
        } finally {

            await this.state.storage.setAlarm(Date.now() + TODAY_STATS_REFRESH_INTERVAL_MS);
        }

        try {
            await this.pollUkraineAlarmIfDue();
        } catch (err) {
            this.ukraineAlarmOriginError = { status: 0, body: err.message };
        }
    }

    async handleUkraineAlarmWebhook(request) {
        const rawBody = await request.text();
        const signature = request.headers.get('X-Webhook-Signature');
        const timestamp = request.headers.get('X-Webhook-Timestamp');
        const alg = (request.headers.get('X-Webhook-Signature-Alg') || '').toLowerCase();

        if (!signature || !timestamp) {
            return new Response('Missing signature headers', { status: 400 });
        }
        if (alg && alg !== 'rsa-sha256') {
            return new Response('Unsupported signature algorithm', { status: 400 });
        }
        if (!this.env.UKRAINEALARM_WEBHOOK_PUBLIC_KEY) {
            return new Response('Webhook not configured', { status: 503 });
        }

        const timestampMs = Number(timestamp) * 1000;
        if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > UKRAINEALARM_WEBHOOK_MAX_TIMESTAMP_AGE_MS) {
            return new Response('Timestamp out of range', { status: 400 });
        }

        let verified = false;
        try {
            verified = await verifyUkraineAlarmWebhookSignature(
                this.env.UKRAINEALARM_WEBHOOK_PUBLIC_KEY,
                signature,
                `${timestamp}.${rawBody}`
            );
        } catch (err) {
            verified = false;
        }
        if (!verified) {
            return new Response('Invalid signature', { status: 401 });
        }

        const now = Date.now();
        for (const [hash, seenAt] of this.ukraineAlarmWebhookSeenHashes) {
            if (now - seenAt > UKRAINEALARM_WEBHOOK_DEDUPE_WINDOW_MS) this.ukraineAlarmWebhookSeenHashes.delete(hash);
        }
        const bodyHash = await sha256Hex(rawBody);
        if (this.ukraineAlarmWebhookSeenHashes.has(bodyHash)) {

            return new Response('Duplicate, already processed', { status: 200 });
        }
        this.ukraineAlarmWebhookSeenHashes.set(bodyHash, now);

        await this.state.storage.put('ukraineAlarmLastWebhookPayload', {
            receivedAt: new Date(now).toISOString(),
            body: rawBody.slice(0, 5000),
        });

        let event = null;
        try {
            event = JSON.parse(rawBody);
        } catch (err) {
            event = null;
        }

        if (event && event.status === 'Activate' && event.regionId !== undefined && event.alarmType && event.createdAt) {
            await this.applyUkraineAlarmActivateEvent(event);
        } else {
            await this.pollUkraineAlarmIfDue({ force: true });
        }

        return new Response('OK', { status: 200 });
    }

    async applyUkraineAlarmActivateEvent(event) {
        const saved = (await this.state.storage.get('ukraineAlarmState')) || {
            lastFetchAt: 0,
            lastFullFetchAt: 0,
            lastActionIndex: null,
            latestAlerts: [],
            observations: [],
        };
        if (!saved.latestAlerts) saved.latestAlerts = [];

        const regionId = String(event.regionId);
        let region = saved.latestAlerts.find((r) => String(r.regionId) === regionId);
        if (!region) {
            region = { regionId, regionType: undefined, regionName: undefined, lastUpdate: event.createdAt, activeAlerts: [] };
            saved.latestAlerts.push(region);
        }
        if (!region.activeAlerts) region.activeAlerts = [];
        region.lastUpdate = event.createdAt;

        const alreadyActive = region.activeAlerts.some((a) => a.type === event.alarmType);
        if (!alreadyActive) {
            region.activeAlerts.push({ regionId, type: event.alarmType, lastUpdate: event.createdAt });
        }

        await this.state.storage.put('ukraineAlarmState', saved);
        this.broadcastUkraineAlarmAlerts(saved);
    }

    async pollUkraineAlarmIfDue({ force = false } = {}) {
        if (!this.env.UKRAINEALARM_TOKEN) return;

        let saved = (await this.state.storage.get('ukraineAlarmState')) || {
            lastFetchAt: 0,
            lastFullFetchAt: 0,
            lastActionIndex: null,
            latestAlerts: null,
            observations: [],
        };

        const now = Date.now();
        if (!force && now - saved.lastFetchAt < UKRAINEALARM_MIN_GAP_MS) return;

        saved.lastFetchAt = now;

        let indexChanged = true;
        let dueForSafetyNetRefresh = true;

        if (!force) {
            this.ukraineAlarmFetchTimestamps.push(now);

            const statusResponse = await fetch(`${UKRAINEALARM_BASE_URL}/alerts/status`, {
                headers: { Authorization: this.env.UKRAINEALARM_TOKEN },
            });

            if (!statusResponse.ok) {
                this.ukraineAlarmOriginError = { status: statusResponse.status, body: await statusResponse.text() };
                await this.state.storage.put('ukraineAlarmState', saved);
                return;
            }

            this.ukraineAlarmOriginError = null;
            const { lastActionIndex } = await statusResponse.json();
            indexChanged = lastActionIndex !== saved.lastActionIndex;
            dueForSafetyNetRefresh = now - saved.lastFullFetchAt >= UKRAINEALARM_FORCE_REFRESH_MS;
            saved.lastActionIndex = lastActionIndex;
        }

        if (indexChanged || dueForSafetyNetRefresh) {
            this.ukraineAlarmFetchTimestamps.push(Date.now());
            const alertsResponse = await fetch(`${UKRAINEALARM_BASE_URL}/alerts`, {
                headers: { Authorization: this.env.UKRAINEALARM_TOKEN },
            });

            if (alertsResponse.ok) {
                const alerts = await alertsResponse.json();
                saved.latestAlerts = alerts;
                saved.lastFullFetchAt = now;
                this.recordUkraineAlarmObservations(saved, alerts, now);
            } else {
                this.ukraineAlarmOriginError = { status: alertsResponse.status, body: await alertsResponse.text() };
            }
        }

        await this.state.storage.put('ukraineAlarmState', saved);
        this.broadcastUkraineAlarmAlerts(saved);
    }

    recordUkraineAlarmObservations(saved, alerts, now) {
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

    buildUkraineAlarmAlertsBody(saved) {
        const now = Date.now();

        const alerts = [];
        (saved && saved.latestAlerts ? saved.latestAlerts : []).forEach((region) => {
            (region.activeAlerts || []).forEach((alert) => {
                const mappedType = UKRAINEALARM_TYPE_MAP[alert.type];
                if (!mappedType) return;

                const ageMs = now - new Date(alert.lastUpdate).getTime();
                if (ageMs > UKRAINEALARM_STALE_ALERT_THRESHOLD_MS) return;

                const activeAlertLevels = alert.activeAlertLevels || [];

                alerts.push({
                    id: `ukrainealarm-${region.regionId}-${mappedType}`,
                    location_uid: Number(region.regionId),
                    location_title: region.regionName,
                    alert_type: mappedType,
                    started_at: alert.lastUpdate,
                    alert_level: worstUkraineAlarmLevel(activeAlertLevels),
                    threats: mapUkraineAlarmThreats(activeAlertLevels),
                });
            });
        });

        return JSON.stringify({ alerts });
    }

    broadcastUkraineAlarmAlerts(saved) {
        const sockets = this.state.getWebSockets('alerts');
        if (!sockets.length) return;

        const body = this.buildUkraineAlarmAlertsBody(saved);
        if (body === this.lastBroadcastAlertsBody) return;
        this.lastBroadcastAlertsBody = body;

        sockets.forEach((ws) => {
            try {
                ws.send(body);
            } catch (err) {
                /* a dead socket will be cleaned up via webSocketClose/webSocketError */
            }
        });
    }

    async acceptAlertsWebSocket() {
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        this.state.acceptWebSocket(server, ['alerts']);

        const saved = await this.state.storage.get('ukraineAlarmState');
        server.send(this.buildUkraineAlarmAlertsBody(saved));

        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage() {
        /* clients never send anything meaningful; the channel is push-only */
    }

    async webSocketClose(ws, code, reason, wasClean) {
        ws.close(code, reason);
    }

    async webSocketError() {}

    async getUkraineAlarmAlerts() {
        try {
            await this.pollUkraineAlarmIfDue();
        } catch (err) {
            this.ukraineAlarmOriginError = { status: 0, body: err.message };
        }

        const saved = await this.state.storage.get('ukraineAlarmState');
        return new Response(this.buildUkraineAlarmAlertsBody(saved), { headers: { 'Content-Type': 'application/json' } });
    }

    async fetchUkraineAlarmDateHistory(dateKey) {
        const response = await fetch(`${UKRAINEALARM_BASE_URL}/alerts/dateHistory?date=${dateKey.replace(/-/g, '')}`, {
            headers: { Authorization: this.env.UKRAINEALARM_TOKEN },
        });

        if (!response.ok) {
            return { error: { status: response.status, body: await response.text() } };
        }

        const raw = await response.json();
        const alerts = raw
            .filter((record) => UKRAINEALARM_TYPE_MAP[record.alertType])
            .filter((record) => parseDotNetDurationMs(record.duration) <= UKRAINEALARM_TODAY_MAX_DURATION_MS)
            .map((record) => ({

                id: `ukrainealarm-${record.regionId}-${record.startDate}`,
                location_uid: Number(record.regionId),
                location_title: record.regionName,
                alert_type: UKRAINEALARM_TYPE_MAP[record.alertType],
                started_at: record.startDate,
                finished_at: new Date(new Date(record.startDate).getTime() + parseDotNetDurationMs(record.duration)).toISOString(),
            }));

        return { alerts };
    }

    async getUkraineAlarmTodayStats() {
        const todayKey = kyivDateKey(new Date());
        const now = Date.now();

        if (
            !this.ukraineAlarmTodayCache ||
            this.ukraineAlarmTodayCache.date !== todayKey ||
            now - this.ukraineAlarmTodayCache.fetchedAt >= UKRAINEALARM_TODAY_CACHE_TTL_MS
        ) {
            const result = await this.fetchUkraineAlarmDateHistory(todayKey);
            if (result.error) {
                this.ukraineAlarmTodayOriginError = result.error;
            } else {
                this.ukraineAlarmTodayOriginError = null;
                this.ukraineAlarmTodayCache = { date: todayKey, alerts: result.alerts, fetchedAt: now };
            }
        }

        if (this.ukraineAlarmTodayOriginError && !this.ukraineAlarmTodayCache) {
            return new Response(JSON.stringify({ error: this.ukraineAlarmTodayOriginError }), {
                status: this.ukraineAlarmTodayOriginError.status || 502,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const body = JSON.stringify({
            date: this.ukraineAlarmTodayCache.date,
            alerts: this.ukraineAlarmTodayCache.alerts,
            complete: true,
            warmupEtaMinutes: 0,
        });
        return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    }

    async getUkraineAlarmDateStats(dateParam) {
        const dateKey = `${dateParam.slice(0, 4)}-${dateParam.slice(4, 6)}-${dateParam.slice(6, 8)}`;

        if (!this.ukraineAlarmDateStatsCache.has(dateKey)) {
            const result = await this.fetchUkraineAlarmDateHistory(dateKey);
            if (result.error) {
                return new Response(JSON.stringify({ error: result.error }), {
                    status: result.error.status || 502,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            this.ukraineAlarmDateStatsCache.set(dateKey, result.alerts);
        }

        const body = JSON.stringify({ date: dateKey, alerts: this.ukraineAlarmDateStatsCache.get(dateKey) });
        return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    }

    async getUkraineAlarmRegionHistory(regionId) {
        const now = Date.now();
        const cached = this.ukraineAlarmRegionHistoryCache.get(regionId);

        if (!cached || now - cached.fetchedAt >= HISTORY_CACHE_TTL_MS) {
            try {
                const response = await fetch(`${UKRAINEALARM_BASE_URL}/alerts/regionHistory?regionId=${regionId}`, {
                    headers: { Authorization: this.env.UKRAINEALARM_TOKEN },
                });

                if (!response.ok) {
                    this.ukraineAlarmRegionHistoryOriginErrors.set(regionId, { status: response.status, body: await response.text() });
                } else {
                    const raw = await response.json();

                    const records = (raw && raw[0] && raw[0].alarms) || [];
                    const alerts = records
                        .filter((record) => UKRAINEALARM_TYPE_MAP[record.alertType])
                        .filter((record) => parseDotNetDurationMs(record.duration) <= UKRAINEALARM_TODAY_MAX_DURATION_MS)
                        .map((record) => ({
                            id: `ukrainealarm-${regionId}-${record.startDate}`,
                            location_uid: Number(regionId),
                            location_title: record.regionName,
                            alert_type: UKRAINEALARM_TYPE_MAP[record.alertType],
                            started_at: record.startDate,
                            finished_at: new Date(new Date(record.startDate).getTime() + parseDotNetDurationMs(record.duration)).toISOString(),
                        }));

                    this.ukraineAlarmRegionHistoryOriginErrors.delete(regionId);
                    this.ukraineAlarmRegionHistoryCache.set(regionId, { alerts, fetchedAt: now });
                }
            } catch (err) {
                this.ukraineAlarmRegionHistoryOriginErrors.set(regionId, { status: 0, body: err.message });
            }
        }

        if (!this.ukraineAlarmRegionHistoryCache.has(regionId)) {
            const originError = this.ukraineAlarmRegionHistoryOriginErrors.get(regionId);
            if (originError) {
                return new Response(JSON.stringify({ error: originError }), {
                    status: originError.status || 502,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }

        const body = JSON.stringify({ alerts: this.ukraineAlarmRegionHistoryCache.get(regionId).alerts });
        return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    }

    async getUkraineAlarmStatus() {
        const now = Date.now();
        const saved = (await this.state.storage.get('ukraineAlarmState')) || null;
        const requestsLastMinute = pruneAndCount(this.ukraineAlarmFetchTimestamps, now);
        const lastWebhookPayload = await this.state.storage.get('ukraineAlarmLastWebhookPayload');

        const body = JSON.stringify({
            generatedAt: new Date(now).toISOString(),
            configured: Boolean(this.env.UKRAINEALARM_TOKEN),
            requestsLastMinute,
            minGapMs: UKRAINEALARM_MIN_GAP_MS,
            lastFetchAgeMs: saved ? now - saved.lastFetchAt : null,
            lastFullFetchAgeMs: saved && saved.lastFullFetchAt ? now - saved.lastFullFetchAt : null,
            lastActionIndex: saved ? saved.lastActionIndex : null,
            currentActiveAlertCount: saved && saved.latestAlerts ? saved.latestAlerts.length : null,
            staleAlertObservations: saved ? saved.observations : [],
            currentError: this.ukraineAlarmOriginError,
            webhookConfigured: Boolean(this.env.UKRAINEALARM_WEBHOOK_PUBLIC_KEY),
            lastWebhookPayload,
        });

        return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    }

    async loadTodayStatsState() {
        const todayKey = kyivDateKey(new Date());
        let saved = await this.state.storage.get('todayStatsState');
        if (!saved || saved.date !== todayKey) {
            saved = { date: todayKey, cursor: 0, byOblast: {} };
            await this.state.storage.put('todayStatsState', saved);
        }
        return saved;
    }

    async refreshOneOblastForToday() {
        const todayState = await this.loadTodayStatsState();
        const uid = ALL_OBLAST_UIDS[todayState.cursor % ALL_OBLAST_UIDS.length];
        todayState.cursor += 1;

        const response = await this.getHistory(String(uid));
        if (response.ok) {
            const data = await response.json();
            const alerts = (data.alerts || []).filter(
                (alert) => alert.started_at && kyivDateKey(new Date(alert.started_at)) === todayState.date
            );
            todayState.byOblast[uid] = alerts;
        }

        await this.state.storage.put('todayStatsState', todayState);
    }

    async getTodayStats() {
        const todayState = await this.loadTodayStatsState();
        const allAlerts = Object.values(todayState.byOblast).flat();

        const byHour = Array.from({ length: 24 }, () => 0);
        const byOblast = new Map();
        allAlerts.forEach((alert) => {
            byHour[kyivHour(alert.started_at)]++;
            if (alert.location_oblast) {
                byOblast.set(alert.location_oblast, (byOblast.get(alert.location_oblast) || 0) + 1);
            }
        });

        const oblastsRemaining = Math.max(0, ALL_OBLAST_UIDS.length - todayState.cursor);
        const complete = oblastsRemaining === 0;
        const warmupEtaMinutes = complete
            ? 0
            : Math.ceil((oblastsRemaining * TODAY_STATS_REFRESH_INTERVAL_MS) / 60000);

        const body = JSON.stringify({
            date: todayState.date,
            total: allAlerts.length,
            byHour,
            byOblast: Array.from(byOblast, ([oblast, count]) => ({ oblast, count })).sort((a, b) => b.count - a.count),
            alerts: allAlerts,
            complete,
            warmupEtaMinutes,
        });

        return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    }

    async getStatus() {
        const now = Date.now();
        const ageOrNull = (ts) => (ts ? now - ts : null);
        const percentOf = (count, limit) => Math.round((count / limit) * 100);

        const todayState = await this.loadTodayStatsState();
        const oblastsRemaining = Math.max(0, ALL_OBLAST_UIDS.length - todayState.cursor);
        const uniqueUsersState = await this.state.storage.get('uniqueUsersState');
        const allTimeUniqueUsersState = await this.state.storage.get('allTimeUniqueUsersState');

        const generalRequestsLastMinute = pruneAndCount(this.allAlertsInUaFetchTimestamps, now);
        const historyRequestsLastMinute = pruneAndCount(this.historyFetchTimestamps, now);

        const body = JSON.stringify({
            generatedAt: new Date(now).toISOString(),
            active: {

                softLimitPerMinute: 9,
                hardLimitPerMinute: 12,
                requestsLastMinute: generalRequestsLastMinute,
                percentOfSoftLimit: percentOf(generalRequestsLastMinute, 9),
                percentOfHardLimit: percentOf(generalRequestsLastMinute, 12),
                minGapMs: ACTIVE_MIN_GAP_MS,
                cacheTtlMs: ACTIVE_CACHE_TTL_MS,
                lastOriginFetchAgeMs: ageOrNull(this.lastActiveOriginFetchAt),
                cacheAgeMs: this.activeCache ? now - this.activeCache.fetchedAt : null,
                currentError: this.activeOriginError,
            },
            history: {

                limitPerMinute: 2,
                requestsLastMinute: historyRequestsLastMinute,
                percentOfLimit: percentOf(historyRequestsLastMinute, 2),
                minGapMs: HISTORY_MIN_GAP_MS,
                cacheTtlMs: HISTORY_CACHE_TTL_MS,
                lastOriginFetchAgeMs: ageOrNull(this.lastHistoryOriginFetchAt),
                cachedUidCount: this.historyCache.size,
                currentErrors: Object.fromEntries(this.historyOriginErrors),
            },
            regionStatuses: {

                minGapMs: REGION_STATUSES_MIN_GAP_MS,
                cacheTtlMs: REGION_STATUSES_CACHE_TTL_MS,
                lastOriginFetchAgeMs: ageOrNull(this.lastRegionStatusesOriginFetchAt),
                cacheAgeMs: this.regionStatusesCache ? now - this.regionStatusesCache.fetchedAt : null,
                currentError: this.regionStatusesOriginError,
            },
            weaponStats: {

                cacheTtlMs: WEAPON_STATS_CACHE_TTL_MS,
                lastOriginFetchAgeMs: ageOrNull(this.lastWeaponStatsOriginFetchAt),
                cacheAgeMs: this.weaponStatsCache ? now - this.weaponStatsCache.fetchedAt : null,
                currentError: this.weaponStatsOriginError,
            },
            todayStats: {
                date: todayState.date,
                oblastsCovered: ALL_OBLAST_UIDS.length - oblastsRemaining,
                oblastsTotal: ALL_OBLAST_UIDS.length,
                complete: oblastsRemaining === 0,
                refreshIntervalMs: TODAY_STATS_REFRESH_INTERVAL_MS,
            },
            uniqueUsers: {

                date: uniqueUsersState ? uniqueUsersState.date : kyivDateKey(new Date()),
                allTime: allTimeUniqueUsersState ? allTimeUniqueUsersState.hashedIps.length : 0,
                today: uniqueUsersState ? uniqueUsersState.hashedIps.length : 0,
            },
        });

        return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    }

    async getRegionStatuses() {
        const now = Date.now();

        if (!this.regionStatusesCache || now - this.regionStatusesCache.fetchedAt >= REGION_STATUSES_CACHE_TTL_MS) {
            const run = async () => {
                const waitMs = Math.max(0, REGION_STATUSES_MIN_GAP_MS - (Date.now() - this.lastRegionStatusesOriginFetchAt));
                if (waitMs > 0) await delay(waitMs);

                this.lastRegionStatusesOriginFetchAt = Date.now();
                this.allAlertsInUaFetchTimestamps.push(this.lastRegionStatusesOriginFetchAt);
                const upstream = await fetch(REGION_STATUSES_URL, {
                    headers: { Authorization: `Bearer ${this.env.ALERTS_TOKEN}` },
                });
                const body = await upstream.text();

                if (!upstream.ok) {
                    this.regionStatusesOriginError = { status: upstream.status, body };
                    return;
                }

                this.regionStatusesOriginError = null;
                this.regionStatusesCache = { body, fetchedAt: Date.now() };
            };

            const result = this.regionStatusesQueue.then(run, run);
            this.regionStatusesQueue = result.catch(() => {});
            await result;
        }

        if (this.regionStatusesOriginError && !this.regionStatusesCache) {
            return new Response(this.regionStatusesOriginError.body, {
                status: this.regionStatusesOriginError.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const headers = { 'Content-Type': 'text/plain' };
        if (this.regionStatusesOriginError) headers['X-Origin-Error-Status'] = String(this.regionStatusesOriginError.status);
        return new Response(this.regionStatusesCache.body, { headers });
    }

    async getWeaponStats() {
        const now = Date.now();

        if (!this.weaponStatsCache || now - this.weaponStatsCache.fetchedAt >= WEAPON_STATS_CACHE_TTL_MS) {
            const run = async () => {
                const waitMs = Math.max(0, HISTORY_MIN_GAP_MS - (Date.now() - this.lastWeaponStatsOriginFetchAt));
                if (waitMs > 0) await delay(waitMs);
                this.lastWeaponStatsOriginFetchAt = Date.now();

                try {
                    const [attacks, models] = await Promise.all([
                        fetchKaggleCsv(this.env, KAGGLE_ATTACKS_FILE),
                        fetchKaggleCsv(this.env, KAGGLE_MODELS_FILE),
                    ]);
                    const stats = buildWeaponStats(attacks, models);
                    this.weaponStatsOriginError = null;
                    this.weaponStatsCache = { body: JSON.stringify(stats), fetchedAt: Date.now() };
                } catch (err) {
                    this.weaponStatsOriginError = { status: 502, body: err.message };
                }
            };

            const result = this.weaponStatsQueue.then(run, run);
            this.weaponStatsQueue = result.catch(() => {});
            await result;
        }

        if (this.weaponStatsOriginError && !this.weaponStatsCache) {
            return new Response(this.weaponStatsOriginError.body, { status: this.weaponStatsOriginError.status });
        }

        const headers = { 'Content-Type': 'application/json' };
        if (this.weaponStatsOriginError) headers['X-Origin-Error-Status'] = String(this.weaponStatsOriginError.status);
        return new Response(this.weaponStatsCache.body, { headers });
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === UKRAINEALARM_WEBHOOK_PATH) {
            if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
            const id = env.ALERTS_GATEWAY.idFromName('global');
            const stub = env.ALERTS_GATEWAY.get(id);
            return stub.fetch(request);
        }

        if (request.method !== 'GET') {
            return new Response('Method not allowed', { status: 405 });
        }

        const clientKey = request.headers.get('X-Client-Key') || url.searchParams.get('key');
        if (!env.CLIENT_KEY || clientKey !== env.CLIENT_KEY) {
            return new Response('Unauthorized', { status: 401 });
        }

        const id = env.ALERTS_GATEWAY.idFromName('global');
        const stub = env.ALERTS_GATEWAY.get(id);

        return stub.fetch(request);
    },
};

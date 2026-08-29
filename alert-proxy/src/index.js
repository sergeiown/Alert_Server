// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const ACTIVE_ALERTS_URL = 'https://api.alerts.in.ua/v1/alerts/active.json';
const ACTIVE_CACHE_TTL_MS = 30 * 1000;
const ACTIVE_MIN_GAP_MS = 5 * 1000;

const HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const HISTORY_MIN_GAP_MS = 35 * 1000;

// All 26 oblast-level uids alerts.in.ua's /v1/regions/{uid}/alerts endpoint accepts (matches the
// app's own locations.json state list). Cycled round-robin by the today-stats background refresh
// below, one per alarm tick, so a full pass takes ~26 * HISTORY_MIN_GAP_MS.
const ALL_OBLAST_UIDS = [
    3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31,
];
const TODAY_STATS_REFRESH_INTERVAL_MS = HISTORY_MIN_GAP_MS;
const TODAY_STATS_TIMEZONE = 'Europe/Kyiv';

// "Today" is always the alerts' own real-world (Kyiv) calendar day, regardless of which timezone
// the Worker or a requesting client happens to run in.
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

const REGION_STATUSES_URL = 'https://api.alerts.in.ua/v1/iot/active_air_raid_alerts.json';
const REGION_STATUSES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REGION_STATUSES_MIN_GAP_MS = 5 * 1000;

// Kaggle's per-file download endpoint returns the plain CSV directly (no zip wrapper to unpack,
// which a Worker has no built-in support for anyway). The dataset itself is only updated weekly,
// so this is cached far longer than anything else here.
const KAGGLE_DATASET = 'piterfm/massive-missile-attacks-on-ukraine';
const KAGGLE_ATTACKS_FILE = 'missile_attacks_daily.csv';
const KAGGLE_MODELS_FILE = 'missiles_and_uavs.csv';
const WEAPON_STATS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WEAPON_STATS_TOP_MODELS = 20;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Minimal RFC 4180 CSV parser (handles quoted fields containing commas, embedded newlines, and
// "" escaped quotes) - the two Kaggle files have exactly that in a few columns (e.g.
// destroyed_details is a quoted "{'south': 110, ...}"-shaped string), so a naive split(',') would
// silently misalign every field after the first quoted one.
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
        this.activeQueue = Promise.resolve();
        this.historyQueue = Promise.resolve();
        this.regionStatusesQueue = Promise.resolve();
        this.weaponStatsQueue = Promise.resolve();
    }

    async fetch(request) {
        await this.ensureTodayStatsAlarmScheduled();

        const url = new URL(request.url);
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

        return this.getActive(ifModifiedSince);
    }

    async getActive(ifModifiedSince) {
        const now = Date.now();

        if (!this.activeCache || now - this.activeCache.fetchedAt >= ACTIVE_CACHE_TTL_MS) {
            const run = async () => {
                const waitMs = Math.max(0, ACTIVE_MIN_GAP_MS - (Date.now() - this.lastActiveOriginFetchAt));
                if (waitMs > 0) await delay(waitMs);

                this.lastActiveOriginFetchAt = Date.now();
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

    // Keeps a nationwide "today" picture warm continuously via a self-perpetuating alarm, one
    // oblast per tick, so any client asking gets an already-built answer instead of each
    // individual install having to watch the live feed itself from whenever it happened to start.
    async ensureTodayStatsAlarmScheduled() {
        const current = await this.state.storage.getAlarm();
        if (current === null) {
            await this.state.storage.setAlarm(Date.now());
        }
    }

    async alarm() {
        try {
            await this.refreshOneOblastForToday();
        } finally {
            // Always reschedule, even after a failed round, so a single bad fetch can't stall
            // the loop for the rest of the day.
            await this.state.storage.setAlarm(Date.now() + TODAY_STATS_REFRESH_INTERVAL_MS);
        }
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

        // Reuses the same rate-limited/cached fetch the client-facing /history/:uid endpoint
        // uses - both draw from the same shared origin-request budget either way, and a recent
        // forecast lookup for this uid means this call is a free cache hit.
        const response = await this.getHistory(String(uid));
        if (response.ok) {
            const data = await response.json();
            const alerts = (data.alerts || []).filter(
                (alert) => alert.started_at && kyivDateKey(new Date(alert.started_at)) === todayState.date
            );
            todayState.byOblast[uid] = alerts;
        }
        // On failure, leave whatever was previously stored for this uid untouched - a transient
        // origin error shouldn't erase already-known data for that region; the next pass retries.

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

        // cursor counts total refresh attempts since this Kyiv-local day started (never reset
        // mid-day, only on date rollover), so cursor < the oblast count means at least one oblast
        // has never been checked yet today - the total below is a known undercount until then.
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

    async getRegionStatuses() {
        const now = Date.now();

        if (!this.regionStatusesCache || now - this.regionStatusesCache.fetchedAt >= REGION_STATUSES_CACHE_TTL_MS) {
            const run = async () => {
                const waitMs = Math.max(0, REGION_STATUSES_MIN_GAP_MS - (Date.now() - this.lastRegionStatusesOriginFetchAt));
                if (waitMs > 0) await delay(waitMs);

                this.lastRegionStatusesOriginFetchAt = Date.now();
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

    // Unlike every other endpoint here, this one caches the app's own aggregated summary, not a
    // passthrough of the origin response - the raw CSVs (thousands of rows) are only ever fetched
    // and parsed server-side, so the client only ever sees a small, ready-to-render JSON object.
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
        if (request.method !== 'GET') {
            return new Response('Method not allowed', { status: 405 });
        }

        const clientKey = request.headers.get('X-Client-Key');
        if (!env.CLIENT_KEY || clientKey !== env.CLIENT_KEY) {
            return new Response('Unauthorized', { status: 401 });
        }

        const id = env.ALERTS_GATEWAY.idFromName('global');
        const stub = env.ALERTS_GATEWAY.get(id);

        return stub.fetch(request);
    },
};

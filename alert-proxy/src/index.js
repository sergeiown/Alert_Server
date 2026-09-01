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

// One-way hash of the connecting IP - lets unique installs be counted (roughly; NAT/shared IPs
// undercount, IP churn overcounts) without keeping raw addresses around in Durable Object storage.
async function hashIp(ip) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
}

const LOAD_WINDOW_MS = 60 * 1000;

// Drops timestamps older than the rolling window, then reports how many are left - the actual
// "requests in the last minute" figure a known-per-minute limit can be compared against. A plain
// "time since the last fetch" (already tracked elsewhere) can't answer that on its own: it says
// nothing about how many fetches landed earlier in the same window.
function pruneAndCount(timestamps, now) {
    while (timestamps.length && now - timestamps[0] > LOAD_WINDOW_MS) timestamps.shift();
    return timestamps.length;
}

const REGION_STATUSES_URL = 'https://api.alerts.in.ua/v1/iot/active_air_raid_alerts.json';
const REGION_STATUSES_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REGION_STATUSES_MIN_GAP_MS = 5 * 1000;

// UkraineAlarm - now also the app's primary live-alert source (see data-flow-notes.txt), not just
// shadow monitoring. No published rate limit exists for this API, so this still polls gently: a
// cheap /alerts/status check every UKRAINEALARM_MIN_GAP_MS, and the full /alerts body only when
// lastActionIndex actually changed (or periodically as a safety net, in case a change was itself
// missed between checks) - tightened from the original Stage 1 shadow-only values (60s / 15min)
// now that real clients depend on this data's freshness, not just observation.
const UKRAINEALARM_BASE_URL = 'https://api.ukrainealarm.com/api/v3';
const UKRAINEALARM_MIN_GAP_MS = 20 * 1000;
const UKRAINEALARM_FORCE_REFRESH_MS = 5 * 60 * 1000;
const UKRAINEALARM_STALE_ALERT_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const UKRAINEALARM_MAX_OBSERVATIONS = 30;

// Trends "Today" via UkraineAlarm's dateHistory - one request for the whole day, replacing the
// slow 26-oblast round-robin the alerts.in.ua-based today-stats mechanism needs (todayStatsState
// below). Short TTL since a single request is cheap and this is meant to feel closer to
// real-time than the old mechanism's up-to-~15-minute warmup.
const UKRAINEALARM_TODAY_CACHE_TTL_MS = 2 * 60 * 1000;
// A single dateHistory record spans at most one Kyiv-local calendar day - anything claiming
// longer than that within one day's response is implausible (same "stuck alert" caution as the
// live /alerts endpoint, just checked via the duration UkraineAlarm itself computes here instead
// of an age comparison).
const UKRAINEALARM_TODAY_MAX_DURATION_MS = 24 * 60 * 60 * 1000;

// .NET TimeSpan string, e.g. "00:29:40.1514750" or "1.02:30:00" (day.hours:minutes:seconds) for
// anything past 24h - the "d." prefix is only present when there's at least one whole day.
function parseDotNetDurationMs(duration) {
    const dotIndex = duration.indexOf('.');
    const hasDayPrefix = dotIndex !== -1 && duration.slice(0, dotIndex).match(/^\d+$/) && duration.includes(':');
    const days = hasDayPrefix ? Number(duration.slice(0, dotIndex)) : 0;
    const rest = hasDayPrefix ? duration.slice(dotIndex + 1) : duration;
    const [hours, minutes, secondsPart] = rest.split(':');
    const seconds = parseFloat(secondsPart) || 0;
    return (((days * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + seconds) * 1000;
}

// UkraineAlarm's AlertType -> this app's own alert_type strings (alertPoller.js/
// neptunAlertsSource.js's shared vocabulary). UNKNOWN/INFO/CUSTOM have no equivalent in the app's
// existing type set and are dropped rather than guessed at.
const UKRAINEALARM_TYPE_MAP = {
    AIR: 'air_raid',
    ARTILLERY: 'artillery_shelling',
    URBAN_FIGHTS: 'urban_fights',
    CHEMICAL: 'chemical',
    NUCLEAR: 'nuclear',
};

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
        // Rolling request timestamps for the /status load-percentage figures - alerts.in.ua's
        // general limit is shared across active.json/region-statuses/history combined (from the
        // same IP), so allAlertsInUaFetchTimestamps covers all three; historyFetchTimestamps is
        // the same history subset again, checked separately against its own stricter 2/min cap.
        this.allAlertsInUaFetchTimestamps = [];
        this.historyFetchTimestamps = [];
        this.ukraineAlarmFetchTimestamps = [];
        this.ukraineAlarmOriginError = null;
        this.ukraineAlarmTodayCache = null;
        this.ukraineAlarmTodayOriginError = null;
        this.activeQueue = Promise.resolve();
        this.historyQueue = Promise.resolve();
        this.regionStatusesQueue = Promise.resolve();
        this.weaponStatsQueue = Promise.resolve();
    }

    async fetch(request) {
        await this.ensureTodayStatsAlarmScheduled();
        await this.recordUniqueUser(request);

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

    // Keeps a nationwide "today" picture warm continuously via a self-perpetuating alarm, one
    // oblast per tick, so any client asking gets an already-built answer instead of each
    // individual install having to watch the live feed itself from whenever it happened to start.
    async ensureTodayStatsAlarmScheduled() {
        const current = await this.state.storage.getAlarm();
        if (current === null) {
            await this.state.storage.setAlarm(Date.now());
        }
    }

    // Rough usage/growth signal, not precise: every install shares the same client key, so the
    // only distinguishing thing available here at all is the connecting IP - undercounts installs
    // behind the same NAT/shared IP, overcounts a single install whose IP happens to change
    // mid-day. Good enough to notice real growth, not meant as an exact user count.
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

        // Never reset (unlike the daily set above) - a running lifetime-unique count, not just
        // today's. Same undercount/overcount caveats apply, just accumulated across every day
        // this endpoint has been live instead of one calendar day at a time.
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
            // Always reschedule, even after a failed round, so a single bad fetch can't stall
            // the loop for the rest of the day.
            await this.state.storage.setAlarm(Date.now() + TODAY_STATS_REFRESH_INTERVAL_MS);
        }

        // Piggybacks on the same recurring tick - its own internal min-gap (loaded from storage,
        // not memory, since this DO instance can be evicted and recreated between ticks) is what
        // actually paces the real UkraineAlarm requests, not this outer interval.
        try {
            await this.pollUkraineAlarmIfDue();
        } catch (err) {
            this.ukraineAlarmOriginError = { status: 0, body: err.message };
        }
    }

    // Shadow monitoring only (see UKRAINEALARM_* constants above) - never called from any
    // client-facing route except the read-only /ukrainealarm-status introspection endpoint. Not
    // part of the app's actual alert data path.
    async pollUkraineAlarmIfDue() {
        if (!this.env.UKRAINEALARM_TOKEN) return;

        let saved = (await this.state.storage.get('ukraineAlarmState')) || {
            lastFetchAt: 0,
            lastFullFetchAt: 0,
            lastActionIndex: null,
            latestAlerts: null,
            observations: [],
        };

        const now = Date.now();
        if (now - saved.lastFetchAt < UKRAINEALARM_MIN_GAP_MS) return;

        saved.lastFetchAt = now;
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

        const indexChanged = lastActionIndex !== saved.lastActionIndex;
        const dueForSafetyNetRefresh = now - saved.lastFullFetchAt >= UKRAINEALARM_FORCE_REFRESH_MS;

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

        saved.lastActionIndex = lastActionIndex;
        await this.state.storage.put('ukraineAlarmState', saved);
    }

    // Flags entries whose activeAlerts look "stuck" (still reported active well past a plausible
    // real duration) - a real anomaly spotted once already during manual testing (an ARTILLERY
    // alert reported active for over a year). Recorded here, not acted on - Stage 1 is purely
    // about collecting real evidence before any decision on trusting this source.
    //
    // Keyed by regionId+alertType (one slot per distinct stuck alert, not one per poll) - an
    // unkeyed version fills the fixed-size buffer with repeats of the same handful of
    // long-running problems on every poll, crowding out genuinely new/different ones over a
    // multi-day observation window.
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

    // Client-facing: the app's live alert source when alertSourceProvider is 'ukrainealarm'.
    // Serves whatever pollUkraineAlarmIfDue() last cached (kept warm by the recurring alarm() -
    // see above) rather than fetching on demand itself, since freshness here is the background
    // loop's job, not this request's.
    //
    // Filters out any activeAlerts entry older than UKRAINEALARM_STALE_ALERT_THRESHOLD_MS - the
    // real "stuck alert" bug found during evaluation (some entries never clear, one seen still
    // "active" 1600+ days later) would otherwise show a permanently alerted region on the map and
    // in notifications. Also drops any alert type with no equivalent in the app's own vocabulary
    // (UNKNOWN/INFO/CUSTOM) rather than guessing a mapping for it.
    async getUkraineAlarmAlerts() {
        // Was relying entirely on the background alarm() loop to keep ukraineAlarmState warm -
        // real-world alarm scheduling isn't perfectly on-cadence (observed a 6+ minute gap once,
        // long enough to miss a genuinely new alert entirely), so this now also forces a check
        // itself, same as getActive()/getHistory() lazily refreshing on client read rather than
        // trusting a background timer alone. pollUkraineAlarmIfDue() already self-throttles via
        // UKRAINEALARM_MIN_GAP_MS, so calling it here on every request is cheap.
        try {
            await this.pollUkraineAlarmIfDue();
        } catch (err) {
            this.ukraineAlarmOriginError = { status: 0, body: err.message };
        }

        const saved = await this.state.storage.get('ukraineAlarmState');
        const now = Date.now();

        const alerts = [];
        (saved && saved.latestAlerts ? saved.latestAlerts : []).forEach((region) => {
            (region.activeAlerts || []).forEach((alert) => {
                const mappedType = UKRAINEALARM_TYPE_MAP[alert.type];
                if (!mappedType) return;

                const ageMs = now - new Date(alert.lastUpdate).getTime();
                if (ageMs > UKRAINEALARM_STALE_ALERT_THRESHOLD_MS) return;

                alerts.push({
                    // A stable synthetic id (electron-app's forecastHistoryStore.js keys merged
                    // records by `alert.id` - without one here, every UkraineAlarm-derived alert
                    // for the same region would collide on the same undefined key and overwrite
                    // each other). regionId+lastUpdate uniquely and stably identifies one alert.
                    id: `ukrainealarm-${region.regionId}-${alert.lastUpdate}`,
                    location_uid: Number(region.regionId),
                    alert_type: mappedType,
                    started_at: alert.lastUpdate,
                });
            });
        });

        return new Response(JSON.stringify({ alerts }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Trends "Today" via UkraineAlarm - one dateHistory request for the whole Kyiv-local calendar
    // day, client-facing (electron-app's todayStatsStore.js tries this first, falling back to the
    // existing alerts.in.ua-based /today-stats on failure - the same preferred-source-with-
    // automatic-fallback idea as the live alert chain, just for this analytics endpoint instead).
    async getUkraineAlarmTodayStats() {
        const todayKey = kyivDateKey(new Date());
        const now = Date.now();

        if (
            !this.ukraineAlarmTodayCache ||
            this.ukraineAlarmTodayCache.date !== todayKey ||
            now - this.ukraineAlarmTodayCache.fetchedAt >= UKRAINEALARM_TODAY_CACHE_TTL_MS
        ) {
            try {
                const response = await fetch(`${UKRAINEALARM_BASE_URL}/alerts/dateHistory?date=${todayKey.replace(/-/g, '')}`, {
                    headers: { Authorization: this.env.UKRAINEALARM_TOKEN },
                });

                if (!response.ok) {
                    this.ukraineAlarmTodayOriginError = { status: response.status, body: await response.text() };
                } else {
                    const raw = await response.json();
                    const alerts = raw
                        .filter((record) => UKRAINEALARM_TYPE_MAP[record.alertType])
                        .filter((record) => parseDotNetDurationMs(record.duration) <= UKRAINEALARM_TODAY_MAX_DURATION_MS)
                        .map((record) => ({
                            // Same stable-id requirement as getUkraineAlarmAlerts() above -
                            // forecastHistoryStore.js's mergeAlerts keys by `alert.id`.
                            id: `ukrainealarm-${record.regionId}-${record.startDate}`,
                            location_uid: Number(record.regionId),
                            location_title: record.regionName,
                            alert_type: UKRAINEALARM_TYPE_MAP[record.alertType],
                            started_at: record.startDate,
                        }));

                    this.ukraineAlarmTodayOriginError = null;
                    this.ukraineAlarmTodayCache = { date: todayKey, alerts, fetchedAt: now };
                }
            } catch (err) {
                this.ukraineAlarmTodayOriginError = { status: 0, body: err.message };
            }
        }

        if (this.ukraineAlarmTodayOriginError && !this.ukraineAlarmTodayCache) {
            return new Response(JSON.stringify({ error: this.ukraineAlarmTodayOriginError }), {
                status: this.ukraineAlarmTodayOriginError.status || 502,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Unlike the alerts.in.ua-based today-stats, this is a single request for the whole day -
        // no partial-warmup state to report, it's complete from the first successful fetch.
        const body = JSON.stringify({
            date: this.ukraineAlarmTodayCache.date,
            alerts: this.ukraineAlarmTodayCache.alerts,
            complete: true,
            warmupEtaMinutes: 0,
        });
        return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    }

    // Read-only introspection for this Stage of the evaluation - not used by the app. Lets me
    // check in on real accumulated evidence (index churn rate, stuck-alert observations) without
    // costing any extra UkraineAlarm request itself.
    async getUkraineAlarmStatus() {
        const now = Date.now();
        const saved = (await this.state.storage.get('ukraineAlarmState')) || null;
        const requestsLastMinute = pruneAndCount(this.ukraineAlarmFetchTimestamps, now);

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

    // Read-only introspection of this Worker's own internal state - never touches any origin
    // itself, so checking it costs nothing against any rate limit. Meant for an external
    // health-check tool to see how close each origin-facing endpoint is running to its own known
    // limit, not just whether the proxy is up.
    async getStatus() {
        const now = Date.now();
        const ageOrNull = (ts) => (ts ? now - ts : null);
        const percentOf = (count, limit) => Math.round((count / limit) * 100);

        const todayState = await this.loadTodayStatsState();
        const oblastsRemaining = Math.max(0, ALL_OBLAST_UIDS.length - todayState.cursor);
        const uniqueUsersState = await this.state.storage.get('uniqueUsersState');
        const allTimeUniqueUsersState = await this.state.storage.get('allTimeUniqueUsersState');

        // Shared across active.json/region-statuses/history combined - same origin, same IP,
        // one budget - so this single count is what each of those three below is measured against.
        const generalRequestsLastMinute = pruneAndCount(this.allAlertsInUaFetchTimestamps, now);
        const historyRequestsLastMinute = pruneAndCount(this.historyFetchTimestamps, now);

        const body = JSON.stringify({
            generatedAt: new Date(now).toISOString(),
            active: {
                // alerts.in.ua overall soft/hard limit: 8-10 / 12 requests per minute per IP,
                // shared with history and regionStatuses below (not its own separate budget).
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
                // alerts.in.ua's own documented limit for this specific endpoint: 2 requests per
                // minute per IP, shared across every uid (one gate, not per-uid) - on top of
                // (not instead of) the general limit above, since these same requests count
                // toward both budgets at once.
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
                // No limit of its own - counts toward the same general alerts.in.ua budget as
                // active.json above (see percentOfSoftLimit/percentOfHardLimit there).
                minGapMs: REGION_STATUSES_MIN_GAP_MS,
                cacheTtlMs: REGION_STATUSES_CACHE_TTL_MS,
                lastOriginFetchAgeMs: ageOrNull(this.lastRegionStatusesOriginFetchAt),
                cacheAgeMs: this.regionStatusesCache ? now - this.regionStatusesCache.fetchedAt : null,
                currentError: this.regionStatusesOriginError,
            },
            weaponStats: {
                // Kaggle publishes no numeric quota - no percentage to compute here.
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
                // Rough approximation only - see recordUniqueUser()'s own comment for why.
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

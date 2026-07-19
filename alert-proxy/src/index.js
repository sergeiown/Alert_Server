const ACTIVE_ALERTS_URL = 'https://api.alerts.in.ua/v1/alerts/active.json';
const ACTIVE_CACHE_TTL_MS = 30 * 1000;
const ACTIVE_MIN_GAP_MS = 5 * 1000;

const HISTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const HISTORY_MIN_GAP_MS = 32 * 1000;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AlertsGateway {
    constructor(state, env) {
        this.env = env;
        this.activeCache = null;
        this.historyCache = new Map();
        this.lastActiveOriginFetchAt = 0;
        this.lastHistoryOriginFetchAt = 0;
        this.activeQueue = Promise.resolve();
        this.historyQueue = Promise.resolve();
    }

    async fetch(request) {
        const url = new URL(request.url);
        const ifModifiedSince = request.headers.get('If-Modified-Since');

        const historyMatch = url.pathname.match(/^\/history\/(\d+)$/);
        if (historyMatch) {
            return this.getHistory(historyMatch[1]);
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
                const lastModified = upstream.headers.get('Last-Modified');

                this.activeCache = { body, lastModified, fetchedAt: Date.now() };
            };

            const result = this.activeQueue.then(run, run);
            this.activeQueue = result.catch(() => {});
            await result;
        }

        const { body, lastModified } = this.activeCache;

        if (ifModifiedSince && lastModified && new Date(ifModifiedSince) >= new Date(lastModified)) {
            return new Response(null, { status: 304, headers: lastModified ? { 'Last-Modified': lastModified } : {} });
        }

        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (lastModified) headers.set('Last-Modified', lastModified);
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

                this.historyCache.set(uid, { body, fetchedAt: Date.now() });
            };

            const result = this.historyQueue.then(run, run);
            this.historyQueue = result.catch(() => {});
            await result;
        }

        const { body } = this.historyCache.get(uid);
        return new Response(body, { headers: { 'Content-Type': 'application/json' } });
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

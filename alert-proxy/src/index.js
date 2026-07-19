const ACTIVE_ALERTS_URL = 'https://api.alerts.in.ua/v1/alerts/active.json';
const ACTIVE_ALERTS_CACHE_TTL_SECONDS = 30;
const HISTORY_CACHE_TTL_SECONDS = 900;

async function proxyRequest(request, env, ctx, upstreamUrl, cacheTtlSeconds) {
    const cache = caches.default;
    const cacheKey = new Request(upstreamUrl);

    let cached = await cache.match(cacheKey);

    if (!cached) {
        const upstreamResponse = await fetch(upstreamUrl, {
            headers: { Authorization: `Bearer ${env.ALERTS_TOKEN}` },
        });

        const body = await upstreamResponse.arrayBuffer();
        const headers = new Headers({ 'Content-Type': 'application/json' });

        const lastModified = upstreamResponse.headers.get('Last-Modified');
        if (lastModified) {
            headers.set('Last-Modified', lastModified);
        }
        headers.set('Cache-Control', `public, max-age=${cacheTtlSeconds}`);

        cached = new Response(body, { status: upstreamResponse.status, headers });

        ctx.waitUntil(cache.put(cacheKey, cached.clone()));
    }

    const ifModifiedSince = request.headers.get('If-Modified-Since');
    const lastModified = cached.headers.get('Last-Modified');
    if (ifModifiedSince && lastModified && new Date(ifModifiedSince) >= new Date(lastModified)) {
        return new Response(null, { status: 304, headers: { 'Last-Modified': lastModified } });
    }

    return cached;
}

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'GET') {
            return new Response('Method not allowed', { status: 405 });
        }

        const clientKey = request.headers.get('X-Client-Key');
        if (!env.CLIENT_KEY || clientKey !== env.CLIENT_KEY) {
            return new Response('Unauthorized', { status: 401 });
        }

        const url = new URL(request.url);
        const historyMatch = url.pathname.match(/^\/history\/(\d+)$/);

        if (historyMatch) {
            const uid = historyMatch[1];
            const upstreamUrl = `https://api.alerts.in.ua/v1/regions/${uid}/alerts/month_ago.json`;
            return proxyRequest(request, env, ctx, upstreamUrl, HISTORY_CACHE_TTL_SECONDS);
        }

        return proxyRequest(request, env, ctx, ACTIVE_ALERTS_URL, ACTIVE_ALERTS_CACHE_TTL_SECONDS);
    },
};

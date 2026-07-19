const UPSTREAM_URL = 'https://api.alerts.in.ua/v1/alerts/active.json';
const CACHE_TTL_SECONDS = 30;

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'GET') {
            return new Response('Method not allowed', { status: 405 });
        }

        const clientKey = request.headers.get('X-Client-Key');
        if (!env.CLIENT_KEY || clientKey !== env.CLIENT_KEY) {
            return new Response('Unauthorized', { status: 401 });
        }

        const cache = caches.default;
        const cacheKey = new Request(UPSTREAM_URL);

        let cached = await cache.match(cacheKey);

        if (!cached) {
            const upstreamResponse = await fetch(UPSTREAM_URL, {
                headers: { Authorization: `Bearer ${env.ALERTS_TOKEN}` },
            });

            const body = await upstreamResponse.arrayBuffer();
            const headers = new Headers({ 'Content-Type': 'application/json' });

            const lastModified = upstreamResponse.headers.get('Last-Modified');
            if (lastModified) {
                headers.set('Last-Modified', lastModified);
            }
            headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);

            cached = new Response(body, { status: upstreamResponse.status, headers });

            ctx.waitUntil(cache.put(cacheKey, cached.clone()));
        }

        const ifModifiedSince = request.headers.get('If-Modified-Since');
        const lastModified = cached.headers.get('Last-Modified');
        if (ifModifiedSince && lastModified && new Date(ifModifiedSince) >= new Date(lastModified)) {
            return new Response(null, { status: 304, headers: { 'Last-Modified': lastModified } });
        }

        return cached;
    },
};

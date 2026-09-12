# alert-proxy

Cloudflare Worker (a single global Durable Object) that hides upstream API tokens (UkraineAlarm, alerts.in.ua, Kaggle) from the client app, caches every upstream feed at the edge, and serves them to every user from that one shared cache.

## Usage against Cloudflare limits

Per always-on client instance, steady-state requests against this Worker:

| Feed | Interval | Requests/day |
|---|---|---|
| Alerts poll | 30s | 2880 |
| Today-stats | 5 min, currently 2 calls/cycle - UkraineAlarm's `dateHistory` 401s for "today" every time, falling back to alerts.in.ua | ~576 |
| Weapon-stats | 24h | 1 |
| **Total** | | **~3457/day/user** |

Occupied-territory (DeepState) and update checks (GitHub Releases) bypass this Worker entirely - the app fetches those directly.

### Headroom

- **Workers Free** ([limits](https://developers.cloudflare.com/workers/platform/limits/)): 100,000 requests/day, account-wide - shared by every user, since all traffic hits the one global Durable Object. That's roughly **29 concurrent always-on users** before the whole account starts failing for everyone for the rest of that day.
- **Workers Paid** ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)): $5/month, 10,000,000 requests included per month (~333k/day equivalent), then $0.30 per additional million. About 96 users fit inside the included allowance alone; ~1,000 always-on users costs roughly $33/month total; ~10,000 roughly $313/month.
- Durable Objects have a soft limit of 1,000 requests/second per object ([limits](https://developers.cloudflare.com/durable-objects/platform/limits/)) - far above anything this traffic pattern would reach.

### Options to raise the ceiling, roughly in order of effort

1. Resolve the today-stats double-fetch, if UkraineAlarm's `dateHistory` endpoint ever turns out to support same-day queries (currently looks like it rejects "today" by design - unconfirmed either way).
2. Lengthen the alerts poll interval (30s -> 60s roughly halves the dominant cost), at the expense of alert latency.
3. Upgrade to Workers Paid ($5/month) - removes the hard daily cap outright and is by far the cheapest fix per additional user.
4. Replace polling with a push model (WebSocket or SSE from the Durable Object), so an idle client stops consuming a request every 30 seconds regardless of whether anything actually changed - the most scalable option, but a real architecture change.

_Numbers last checked against the current Cloudflare docs: 2026-09-12._

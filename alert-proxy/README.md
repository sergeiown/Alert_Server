# alert-proxy

Cloudflare Worker (a single global Durable Object) that hides upstream API tokens (UkraineAlarm, alerts.in.ua, Kaggle) from the client app, caches every upstream feed at the edge, and serves them to every user from that one shared cache.

## Usage against Cloudflare limits

The dominant feed (active alerts) is now pushed over a WebSocket (`GET /ws`, upgraded via the Durable Object's WebSocket Hibernation API) instead of polled - the client opens one connection at startup and the Object sends a fresh snapshot only when the underlying data actually changes (from the UkraineAlarm webhook or the Object's own periodic poll). A WebSocket message doesn't count as a Workers request the way an HTTP call does, so this feed no longer scales with how often the client would otherwise have polled.

Per always-on client instance, steady-state requests against this Worker:

| Feed | Mechanism | Requests/day |
|---|---|---|
| Alerts | WebSocket push (`/ws` for UkraineAlarm, `/ws-alerts-in-ua` for its alerts.in.ua failover - same mechanism, same cost either way), one connection per session; falls back to polling every 30s only while the socket is down | ~1 (handshake) + occasional reconnects |
| Today-stats | Polled every 5 min, 1 call/cycle in steady state (the alerts.in.ua fallback call only fires during a genuine transient UkraineAlarm hiccup, confirmed 2026-09-12) | ~288 |
| Weapon-stats | Polled every 24h | 1 |
| **Total** | | **~289/day/user** (was ~3169/day before the push migration) |

Occupied-territory (DeepState) and update checks (GitHub Releases) bypass this Worker entirely - the app fetches those directly.

### Headroom

- **Workers Free** ([limits](https://developers.cloudflare.com/workers/platform/limits/)): 100,000 requests/day, account-wide - shared by every user, since all traffic hits the one global Durable Object. That's roughly **~346 concurrent always-on users** before the whole account starts failing for everyone for the rest of that day (up from ~31 before the push migration).
- **Workers Paid** ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)): $5/month, 10,000,000 requests included per month (~333k/day equivalent), then $0.30 per additional million. About 1,150 users fit inside the included allowance alone.
- Durable Objects have a soft limit of 1,000 requests/second per object ([limits](https://developers.cloudflare.com/durable-objects/platform/limits/)) - far above anything this traffic pattern would reach. A hibernating WebSocket also doesn't hold the Object awake or billed while idle.

### Remaining options to raise the ceiling further, roughly in order of effort

1. Lengthen the today-stats poll interval, or push it over the same WebSocket alongside alerts - it's already cheap (~288/day), so low priority.
2. Upgrade to Workers Paid ($5/month) - removes the hard daily cap outright.

_Numbers last checked against the current Cloudflare docs: 2026-09-12._

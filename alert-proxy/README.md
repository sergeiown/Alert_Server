# alert-proxy

Cloudflare Worker (a single global Durable Object) that hides upstream API tokens (UkraineAlarm, alerts.in.ua, Kaggle) from the client app, caches every upstream feed at the edge, and serves them to every user from that one shared cache.

## Usage against Cloudflare limits

Per always-on client instance, steady-state requests against this Worker:

| Feed | Interval | Requests/day |
|---|---|---|
| Alerts poll | 30s | 2880 |
| Today-stats | 5 min, 1 call/cycle in steady state (the alerts.in.ua fallback call only fires during a genuine transient UkraineAlarm hiccup, confirmed 2026-09-12) | ~288 |
| Weapon-stats | 24h | 1 |
| **Total** | | **~3169/day/user** |

Occupied-territory (DeepState) and update checks (GitHub Releases) bypass this Worker entirely - the app fetches those directly.

### Headroom

- **Workers Free** ([limits](https://developers.cloudflare.com/workers/platform/limits/)): 100,000 requests/day, account-wide - shared by every user, since all traffic hits the one global Durable Object. That's roughly **31 concurrent always-on users** before the whole account starts failing for everyone for the rest of that day.
- **Workers Paid** ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)): $5/month, 10,000,000 requests included per month (~333k/day equivalent), then $0.30 per additional million. About 105 users fit inside the included allowance alone; ~1,000 always-on users costs roughly $31/month total; ~10,000 roughly $287/month.
- Durable Objects have a soft limit of 1,000 requests/second per object ([limits](https://developers.cloudflare.com/durable-objects/platform/limits/)) - far above anything this traffic pattern would reach.

### Options to raise the ceiling, roughly in order of effort

1. Lengthen the alerts poll interval (30s -> 60s roughly halves the dominant cost), at the expense of alert latency.
2. Upgrade to Workers Paid ($5/month) - removes the hard daily cap outright and is by far the cheapest fix per additional user.
3. Replace polling with a push model (WebSocket from the Durable Object, using its WebSocket Hibernation API), so an idle client holds one open connection instead of firing a request every 30 seconds - the most scalable option, but a real architecture change on both the Worker and the client.

_Numbers last checked against the current Cloudflare docs: 2026-09-12._

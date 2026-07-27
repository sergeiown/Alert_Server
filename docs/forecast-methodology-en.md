# Forecast Methodology

**[EN](https://github.com/sergeiown/Alert_Server/blob/main/docs/forecast-methodology-en.md)** | [UA](https://github.com/sergeiown/Alert_Server/blob/main/docs/forecast-methodology-uk.md)

A description of the forecasting approach: where the data comes from, how the alert-probability estimate is calculated, and how the result is presented to the user. This document is deliberately kept at the concept level rather than exact code - implementation details (constants, formulas) change over time, while the general approach described here stays a reliable reference.

## 1. Data source

Alert history comes from the public [alerts.in.ua](https://alerts.in.ua/) API - the same service that provides current-alert data. A key quirk: the API only actually returns history at the **oblast** level (~30 days), not for an individual district or hromada. So for any monitored region, the app:

- determines which oblast it belongs to;
- requests history for the whole oblast at once (several monitored regions within the same oblast share one request);
- if the oblast itself is being tracked as a whole, it counts every alert within its borders; if a specific district/hromada/city is tracked, it filters the response down to just that region.

The API's 30-day limit doesn't mean the app only remembers the last month: it **accumulates history locally**, indefinitely, from whenever the region was first tracked. Updates happen in the background (periodically, and immediately after adding a new region), not only when you happen to look.

Active (current) alerts are a separate, instant data channel with no forecasting model involved - they're simply matched against the list of monitored regions.

## 2. Forecasting approach

The model estimates **intensity** (how often alerts typically occur over a given period) based on historical frequency, not on external factors (satellite data, official warnings, etc.) or explicit seasonality (day of week, time of day).

Key principles:

- **Recency weighting.** Not all historical alerts count equally - recent alerts carry far more weight than older ones. An alert's influence decays exponentially over time (the weight's "half-life" is roughly a day), so the short-term component of the estimate is driven by the last one to two weeks of activity.
- **Long-horizon baseline (plateau).** Besides the fast-decaying short-term estimate, a second, long-horizon one is also calculated - the same way, but with much slower decay (weeks), based on all locally accumulated history. The final estimate is the maximum of the two: right after an alert, the short-term estimate dominates (reacts quickly); if there's been no alert for a long time, the short-term estimate fades and the baseline naturally takes over, instead of continuing to decay toward zero. This prevents the estimated time until the next alert from growing unbounded during a lull and never approaching realistic values.
- **Separate estimate per region and per alert type.** Overall intensity is calculated for the region as a whole, and separately for each alert type (air raid, artillery shelling, etc.). For rare types (few historical occurrences), the estimate is "smoothed" toward the region's overall intensity, proportional to that type's share of all alerts - this prevents sharp, noisy estimates when there's very little data.
- **Significance threshold.** If the estimated intensity is too small (the region has essentially no alert history), no forecast is shown for it - there's no point outputting a number built on statistical noise.
- **The estimate is always "live".** Intensity isn't calculated once and kept forever - it's recomputed from scratch every time, based on the current moment and the accumulated history.

The result of this calculation is a number - "alerts per day" - for the region and for each alert type separately. From it are derived: the probability of an alert within a given time window (via the standard formula for at least one event in a Poisson process) and an approximate "average interval" until the next alert of that type.

## 3. How the result is presented to the user

The same underlying intensity calculation is used differently in three places in the app - it's important to understand this, because their numbers don't always match each other:

1. **The Forecast window** - an expanded card per region: descriptive statistics from history (alert count, average interval, most common time of day and day of week - shown for information only, without affecting the model itself), a breakdown by alert type, and for each type, a "today" probability plus an approximate interval. Cards are sorted from the soonest expected alert to the furthest, with active alerts always on top. If both an oblast and one of its own regions are tracked, only the oblast is shown in the list (to avoid duplicating the same thing).
2. **"Alert approaching" notifications** - fires when the approximate interval to the most likely alert type falls within the time window the user configured. The closer the expected alert, the more often the reminder repeats. If many regions "fire" at once, only a few of the soonest are shown, to avoid a flood of notifications.
3. **The tray popup** ("what's expected soon") - a simplified, less precise variant of the same calculation, meant only as a general pointer in the list; this value can shift unpredictably on every refresh and shouldn't be treated as a precise countdown.

## 4. Known limitations of the approach

- Doesn't account for seasonality (day of week/time of day are shown for reference but don't affect the calculation).
- Doesn't account for correlation between neighboring regions (a mass strike hitting several oblasts at once is estimated independently for each region).
- Doesn't use any external signals (intelligence, official warnings, airspace data) - historical frequency only.
- The short-term component of the model has a short "memory horizon" (roughly a day) - it reacts well to a sudden pickup in activity, but on its own doesn't see longer cycles; the long-horizon baseline partly compensates for this, but it too is a simple exponential decay, not genuine cycle or seasonality detection.
- Outputs a single number (probability, approximate interval), with no uncertainty range. A more precise estimate based on the actual distribution of intervals between alerts (accounting for how much time has already passed since the last one) is a possible future direction, not yet implemented.
- Tracking a whole oblast aggregates the statistics of every region within it into one estimate - this can smooth over or distort the pattern of an individual hot/quiet region inside that oblast.

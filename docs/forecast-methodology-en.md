# Forecast Methodology

[![English](https://img.shields.io/badge/-English-blue)](https://github.com/sergeiown/Alert_Server/blob/main/docs/forecast-methodology-en.md)
[![Українська](https://img.shields.io/badge/-%D0%A3%D0%BA%D1%80%D0%B0%D1%97%D0%BD%D1%81%D1%8C%D0%BA%D0%B0-lightgrey)](https://github.com/sergeiown/Alert_Server/blob/main/docs/forecast-methodology-uk.md)

A description of the forecasting approach: where the data comes from, how the alert-probability estimate is calculated, and how the result is presented to the user. This document is deliberately kept at the concept level rather than exact code - implementation details (constants, formulas) change over time, while the general approach described here stays a reliable reference.

## 1. Data source

Alert history comes from the public [alerts.in.ua](https://alerts.in.ua/) API - the same service that provides current-alert data. A key quirk: the API only actually returns history at the **region** level (~30 days), not for an individual district or hromada. So for any monitored area, the app:

- determines which region it belongs to;
- requests history for the whole region at once (several monitored areas within the same region share one request);
- if the region itself is being tracked as a whole, it counts every alert within its borders; if a specific district/hromada/city is tracked, it filters the response down to just that one.

The API's 30-day limit doesn't mean the app only remembers the last month: it **accumulates history locally**, indefinitely, from whenever the region was first tracked. Updates happen in the background (periodically, and immediately after adding a new region), not only when you happen to look.

Active (current) alerts are a separate, instant data channel with no forecasting model involved - they're simply matched against the list of monitored regions.

## 2. Forecasting approach

The model estimates **intensity** (how often alerts typically occur over a given period) based on historical frequency, not on external factors (satellite data, official warnings, etc.). Day of week feeds in as a small corrective factor (see below); time of day, correlation with neighboring regions, and longer cycles do not.

Key principles:

- **Recency weighting.** Not all historical alerts count equally - recent alerts carry far more weight than older ones. An alert's influence decays exponentially over time (the weight's "half-life" is roughly a day), so the short-term component of the estimate is driven by the last one to two weeks of activity.
- **Long-horizon baseline (plateau).** Besides the fast-decaying short-term estimate, a second, long-horizon one is also calculated - the same way, but with much slower decay (weeks), based on all locally accumulated history. The final estimate is the maximum of the two: right after an alert, the short-term estimate dominates (reacts quickly); if there's been no alert for a long time, the short-term estimate fades and the baseline naturally takes over, instead of continuing to decay toward zero. This prevents the estimated time until the next alert from growing unbounded during a lull and never approaching realistic values.
- **Day-of-week adjustment.** When there's enough accumulated history for a region/alert type, the estimate is also scaled by a small factor reflecting how much busier or quieter today's weekday historically is for that region. The factor is shrunk toward neutral (1.0) when there isn't much same-weekday history yet (so a couple of coincidences don't get read as a real pattern), and is always capped in both directions - in practice, while history is still limited, the effect is usually modest (a few percent).
- **Separate estimate per region and per alert type.** Overall intensity is calculated for the region as a whole, and separately for each alert type (air raid, artillery shelling, etc.). For rare types (few historical occurrences), the estimate is "smoothed" toward the region's overall intensity, proportional to that type's share of all alerts - this prevents sharp, noisy estimates when there's very little data.
- **Significance threshold.** If the estimated intensity is too small (the region has essentially no alert history), no forecast is shown for it - there's no point outputting a number built on statistical noise.
- **The estimate is always "live".** Intensity isn't calculated once and kept forever - it's recomputed from scratch every time, based on the current moment and the accumulated history.

The result of this calculation is a number - "alerts per day" - for the region and for each alert type separately. From it are derived: the probability of an alert within a given time window (via the standard formula for at least one event in a Poisson process) and an approximate "average interval" until the next alert of that type. In the Forecast window, that interval now comes with an actual range too (the 25th-75th percentile of historical gaps between alerts of that type, when there's enough data) - a more honest picture of the spread than a single number.

## 3. How the result is presented to the user

The same underlying intensity calculation is used differently in three places in the app - it's important to understand this, because their numbers don't always match each other:

1. **The Forecast window** - an expanded card per region: descriptive statistics from history (alert count, average interval, most common time of day and day of week - shown for information only, without affecting the model itself), a breakdown by alert type, and for each type, a "today" probability plus an approximate interval. Cards are sorted from the soonest expected alert to the furthest, with active alerts always on top. If both a region and one of its own districts are tracked, only the region is shown in the list (to avoid duplicating the same thing).
2. **"Alert approaching" notifications** - fires when the approximate interval to the most likely alert type falls within the time window the user configured. The closer the expected alert, the more often the reminder repeats. If many regions "fire" at once, only a few of the soonest are shown, to avoid a flood of notifications.
3. **The tray popup** ("what's expected soon") - a simplified, less precise variant of the same calculation, meant only as a general pointer in the list; this value can shift unpredictably on every refresh and shouldn't be treated as a precise countdown.

## 4. Known limitations of the approach

- **Seasonality is only partly accounted for.** Day of week nudges the estimate via a small factor (see §2); time of day is still purely descriptive and doesn't affect the calculation. With limited accumulated history (typically true for a newly tracked region), the day-of-week adjustment is deliberately kept close to neutral - it only sharpens with more time.
- **Doesn't account for correlation between neighboring regions.** A mass strike hitting several regions at once ("something is happening nationwide right now") is estimated independently for each one - broader national activity doesn't raise the estimate for a specific quiet region. This is technically feasible (the app already receives the full nationwide active-alert list every few minutes), but deliberately not added yet: without a solid historical baseline to calibrate "normal" simultaneous activity against, a signal like this is easy to make either too noisy or misleading - and the downside of getting a threat-relevant model wrong outweighs the upside here.
- **Doesn't use any external signals** (intelligence, official warnings, airspace data) - historical frequency only. This is a hard limitation without a new data source - alerts.in.ua doesn't provide this data.
- **The short-term component of the model has a short "memory horizon"** (roughly a day) - it reacts well to a sudden pickup in activity, but on its own doesn't see longer cycles; the long-horizon baseline and the day-of-week adjustment partly compensate for this, but neither is genuine cycle detection. In particular, a short burst (2-3 alerts within a few hours) isn't specifically recognized as its own signal - tested against real data: a direct attempt via the empirical gap distribution (below) doesn't reliably improve the estimate in that exact situation, and sometimes makes it worse, so "burst sensitivity" isn't implemented.
- **A single number, now with a range.** In the Forecast window, the point estimate (probability, approximate interval) now comes with an actual range too - the 25th/75th percentile of historical gaps between alerts (when there's enough of a sample) - a more honest picture than one number alone. Notifications and the tray popup still show only the point number (less room for text there).
- Tracking a whole region aggregates the statistics of every district or hromada within it into one estimate - this can smooth over or distort the pattern of an individual hot/quiet spot inside it.

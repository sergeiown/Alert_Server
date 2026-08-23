const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MEANINGFUL_LAMBDA = 1 / (10 * 365);

function filterUsableAlerts(alerts) {
    return alerts.filter((alert) => !alert.deleted_at);
}

function freshnessWeight(alert, nowMs, halfLifeDays) {
    const tau = halfLifeDays / Math.LN2;
    const ageDays = (nowMs - new Date(alert.started_at).getTime()) / DAY_MS;
    return Math.exp(-ageDays / tau);
}

function exposureDays(windowDays, halfLifeDays) {
    const tau = halfLifeDays / Math.LN2;
    return tau * (1 - Math.exp(-windowDays / tau));
}

function weightedCount(alerts, nowMs, halfLifeDays) {
    return alerts.reduce((sum, alert) => sum + freshnessWeight(alert, nowMs, halfLifeDays), 0);
}

function baselineLambdaOf(alerts, nowMs, config) {
    const baselineExposure = exposureDays(config.BASELINE_WINDOW_DAYS, config.BASELINE_HALF_LIFE_DAYS);
    return weightedCount(alerts, nowMs, config.BASELINE_HALF_LIFE_DAYS) / baselineExposure;
}

// How much busier or quieter today's weekday historically is versus this alert set's own
// average, shrunk toward 1 (no adjustment) when there isn't much same-weekday history yet, and
// clamped so a noisy small sample can never swing the estimate too far in either direction.
function seasonalityMultiplier(alerts, nowMs, config) {
    if (!alerts.length) return 1;

    const times = alerts.map((alert) => new Date(alert.started_at).getTime());
    const spanDays = Math.max(1, (nowMs - Math.min(...times)) / DAY_MS);
    const weekdayOccurrences = spanDays / 7;

    const overallRate = alerts.length / spanDays;
    if (overallRate <= 0) return 1;

    const todayWeekday = new Date(nowMs).getDay();
    const todayCount = times.filter((t) => new Date(t).getDay() === todayWeekday).length;
    const todayRate = todayCount / Math.max(1, weekdayOccurrences);

    const rawMultiplier = todayRate / overallRate;
    const shrinkageWeight = weekdayOccurrences / (weekdayOccurrences + config.SEASONALITY_PRIOR_OCCURRENCES);
    const multiplier = 1 + shrinkageWeight * (rawMultiplier - 1);

    const cap = config.SEASONALITY_MAX_MULTIPLIER;
    return Math.min(cap, Math.max(1 / cap, multiplier));
}

// Same shrink-to-neutral principle as seasonalityMultiplier above, bucketed by hour of day (0-23)
// instead of weekday - independent factor, multiplied in alongside it rather than combined jointly.
function hourOfDayMultiplier(alerts, nowMs, config) {
    if (!alerts.length) return 1;

    const times = alerts.map((alert) => new Date(alert.started_at).getTime());
    const spanDays = Math.max(1, (nowMs - Math.min(...times)) / DAY_MS);
    const hourOccurrences = spanDays;

    const overallRate = alerts.length / spanDays;
    if (overallRate <= 0) return 1;

    const currentHour = new Date(nowMs).getHours();
    const currentHourCount = times.filter((t) => new Date(t).getHours() === currentHour).length;
    const currentHourRate = currentHourCount / Math.max(1, hourOccurrences);

    // overallRate is a per-day rate across all 24 hours combined - divide by 24 to get the rate
    // one would expect for a single hour bucket if alerts were spread evenly across the day,
    // which is the right thing to compare currentHourRate against (mirrors dividing by 7 for
    // weekday above).
    const expectedHourRate = overallRate / 24;
    const rawMultiplier = currentHourRate / expectedHourRate;
    const shrinkageWeight = hourOccurrences / (hourOccurrences + config.HOUR_OF_DAY_PRIOR_OCCURRENCES);
    const multiplier = 1 + shrinkageWeight * (rawMultiplier - 1);

    const cap = config.HOUR_OF_DAY_MAX_MULTIPLIER;
    return Math.min(cap, Math.max(1 / cap, multiplier));
}

function estimateRegionLambda(alerts, nowMs, config) {
    const usableAlerts = filterUsableAlerts(alerts);
    const exposure = exposureDays(config.WINDOW_DAYS, config.HALF_LIFE_DAYS);
    const recentLambda = weightedCount(usableAlerts, nowMs, config.HALF_LIFE_DAYS) / exposure;
    const baselineLambda = baselineLambdaOf(usableAlerts, nowMs, config);

    // max(), not a sum or a smooth blend, on purpose: both terms already estimate the same
    // quantity over the same alerts (just decaying at different rates), so summing would double
    // count, and blending with weights that decay together turns out non-monotonic (dips below
    // the eventual plateau before settling). max() is provably monotonic - as time passes with
    // no new alerts, recentLambda only shrinks and baselineLambda barely moves, so the max simply
    // hands over from one to the other without ever dipping - and a fresh alert makes recentLambda
    // dominate exactly as before the fix.
    const baseLambda = Math.max(recentLambda, baselineLambda);
    const seasonality = seasonalityMultiplier(usableAlerts, nowMs, config);
    const hourOfDay = hourOfDayMultiplier(usableAlerts, nowMs, config);
    const lambda = baseLambda * seasonality * hourOfDay;
    return { lambda, baseLambda, recentLambda, baselineLambda, seasonality, hourOfDay, exposure, usableAlerts };
}

// regionLambda should be the region's baseLambda (pre-seasonality), not its seasonally-adjusted
// lambda - this function applies its own seasonality (from the type's own history) at the end,
// and applying it twice (once via an already-adjusted prior, once directly) would compound it.
function estimateTypeLambda(typeAlerts, totalCount, regionLambda, nowMs, config) {
    const exposure = exposureDays(config.WINDOW_DAYS, config.HALF_LIFE_DAYS);
    const roughShare = typeAlerts.length / totalCount;
    const priorLambda = regionLambda * roughShare;
    const alpha = priorLambda * config.PRIOR_BETA_DAYS;
    const observed = weightedCount(typeAlerts, nowMs, config.HALF_LIFE_DAYS);
    const recentLambda = (alpha + observed) / (config.PRIOR_BETA_DAYS + exposure);
    const baselineLambda = baselineLambdaOf(typeAlerts, nowMs, config);
    const seasonality = seasonalityMultiplier(typeAlerts, nowMs, config);
    const hourOfDay = hourOfDayMultiplier(typeAlerts, nowMs, config);
    return Math.max(recentLambda, baselineLambda) * seasonality * hourOfDay;
}

// Historical gap statistics between consecutive alerts of one type - both the median (used as the
// point ETA instead of the model's own 1/lambda, see below) and a narrow "typically" band around
// it, computed from the same sorted gap list so the two can never contradict each other.
//
// 1/lambda is the MEAN of an exponential distribution, which real alert timing is not - it's
// heavy-tailed (mostly-quick repeats with occasional long lulls), and a heavy tail pulls the mean
// well above the median. That's exactly how a reading like "87%, in ~11h43m (typically 2h58m -
// 8h1m)" happens: the 87%/11h43m pair is internally consistent (both come from the same lambda),
// but the ETA sits entirely outside the very range meant to describe what's typical, which reads
// as nonsense even though neither number is individually wrong. Grounding the ETA in the same
// empirical median as the range fixes that, and is arguably the more honest "expected wait"
// anyway. probabilityToday is left as its own lambda-based reading - "how likely is at least one
// today" is a genuinely different question a single typical-gap number can't answer.
//
// The band itself is deliberately narrower than a full interquartile range
// (config.GAP_RANGE_LOW/HIGH_PERCENTILE default to 0.35/0.65, not 0.25/0.75) - this is meant to
// read as "typically", a central band around the median, not "half of everything that's ever
// happened, outliers included". Even that narrowed band is dropped (range: null) once it's wide
// enough that showing it wouldn't actually help - real alert timing is irregular enough that a
// technically-correct range can still span most of a day, which reads as more precise than it is
// without being useful. The median ETA itself is kept even when the band is dropped.
function gapStats(alerts, config) {
    if (alerts.length < config.MIN_GAP_SAMPLES_FOR_RANGE + 1) return null;

    const sortedAsc = [...alerts].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
    const gaps = [];
    for (let i = 1; i < sortedAsc.length; i++) {
        gaps.push(new Date(sortedAsc[i].started_at).getTime() - new Date(sortedAsc[i - 1].started_at).getTime());
    }
    if (gaps.length < config.MIN_GAP_SAMPLES_FOR_RANGE) return null;

    gaps.sort((a, b) => a - b);
    const pick = (p) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))];
    const median = pick(0.5);
    const low = pick(config.GAP_RANGE_LOW_PERCENTILE);
    const high = pick(config.GAP_RANGE_HIGH_PERCENTILE);
    const range = low > 0 && high / low <= config.GAP_RANGE_MAX_RATIO ? { low, high } : null;

    return { median, range };
}

function computeStats(alerts, nowMs, config) {
    const { lambda: lambdaRegion, baseLambda, usableAlerts } = estimateRegionLambda(alerts, nowMs, config);

    const windowStartMs = nowMs - config.WINDOW_DAYS * DAY_MS;
    const windowAlerts = usableAlerts.filter((a) => new Date(a.started_at).getTime() >= windowStartMs);
    if (!windowAlerts.length) return null;

    const sortedDesc = [...windowAlerts].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    const count = sortedDesc.length;
    const perDay = count / config.WINDOW_DAYS;

    const startTimesAsc = sortedDesc.map((a) => new Date(a.started_at).getTime()).sort((a, b) => a - b);
    let gapSum = 0;
    for (let i = 1; i < startTimesAsc.length; i++) {
        gapSum += startTimesAsc[i] - startTimesAsc[i - 1];
    }
    const avgGapMs = startTimesAsc.length > 1 ? gapSum / (startTimesAsc.length - 1) : null;

    const hourBuckets = { night: 0, morning: 0, day: 0, evening: 0 };
    sortedDesc.forEach((a) => {
        const hour = new Date(a.started_at).getHours();
        if (hour < 6) hourBuckets.night++;
        else if (hour < 12) hourBuckets.morning++;
        else if (hour < 18) hourBuckets.day++;
        else hourBuckets.evening++;
    });
    const mostCommonBucket = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0][0];

    const weekdayOccurrences = [0, 0, 0, 0, 0, 0, 0];
    for (let d = 0; d < config.WINDOW_DAYS; d++) {
        const day = new Date(windowStartMs + d * DAY_MS).getDay();
        weekdayOccurrences[day]++;
    }

    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
    sortedDesc.forEach((a) => {
        const day = new Date(a.started_at).getDay();
        weekdayCounts[day]++;
    });

    const weekdayRates = weekdayCounts.map((c, i) => c / Math.max(1, weekdayOccurrences[i]));
    const maxWeekdayRate = Math.max(...weekdayRates);
    const mostCommonWeekdays =
        maxWeekdayRate > 0
            ? weekdayRates.reduce((acc, rate, i) => (rate === maxWeekdayRate ? [...acc, i] : acc), [])
            : [];

    const todayWeekday = new Date(nowMs).getDay();

    const byType = new Map();
    sortedDesc.forEach((a) => {
        if (!byType.has(a.alert_type)) byType.set(a.alert_type, []);
        byType.get(a.alert_type).push(a);
    });

    const byTypeFull = new Map();
    usableAlerts.forEach((a) => {
        if (!byTypeFull.has(a.alert_type)) byTypeFull.set(a.alert_type, []);
        byTypeFull.get(a.alert_type).push(a);
    });

    const typeBreakdown = Array.from(byType.entries())
        .map(([type, typeAlertsWindow]) => {
            const typeCount = typeAlertsWindow.length;
            const typeAlertsFull = byTypeFull.get(type) || typeAlertsWindow;
            const lambdaType = estimateTypeLambda(typeAlertsFull, usableAlerts.length, baseLambda, nowMs, config);

            const percent = Math.round((typeCount / count) * 100);
            const probabilityToday = Math.round((1 - Math.exp(-lambdaType)) * 100);
            // Grounded in the same empirical median as gapRange below whenever there's enough gap
            // history for that (see the comment on gapStats) - falls back to the model's own
            // 1/lambda mean only while there isn't.
            const gaps = gapStats(typeAlertsFull, config);
            const projectedNextMs = gaps ? gaps.median : lambdaType > MIN_MEANINGFUL_LAMBDA ? (1 / lambdaType) * DAY_MS : null;
            const gapRange = gaps ? gaps.range : null;

            return { type, count: typeCount, percent, projectedNextMs, probabilityToday, gapRange };
        })
        .sort((a, b) => b.count - a.count);

    const lastFinishedMs = sortedDesc[0].finished_at ? new Date(sortedDesc[0].finished_at).getTime() : null;
    const sinceLastMs = lastFinishedMs !== null ? Math.max(0, nowMs - lastFinishedMs) : null;

    return {
        count,
        perDay,
        avgGapMs,
        mostCommonBucket,
        mostCommonWeekdays,
        todayWeekday,
        typeBreakdown,
        sinceLastMs,
        lambdaRegion,
    };
}

module.exports = {
    filterUsableAlerts,
    estimateRegionLambda,
    estimateTypeLambda,
    computeStats,
    DAY_MS,
    MIN_MEANINGFUL_LAMBDA,
};

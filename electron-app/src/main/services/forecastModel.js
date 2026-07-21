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

function estimateRegionLambda(alerts, nowMs, config) {
    const usableAlerts = filterUsableAlerts(alerts);
    const exposure = exposureDays(config.WINDOW_DAYS, config.HALF_LIFE_DAYS);
    const lambda = weightedCount(usableAlerts, nowMs, config.HALF_LIFE_DAYS) / exposure;
    return { lambda, exposure, usableAlerts };
}

function estimateTypeLambda(typeAlerts, totalCount, regionLambda, nowMs, config) {
    const exposure = exposureDays(config.WINDOW_DAYS, config.HALF_LIFE_DAYS);
    const roughShare = typeAlerts.length / totalCount;
    const priorLambda = regionLambda * roughShare;
    const alpha = priorLambda * config.PRIOR_BETA_DAYS;
    const observed = weightedCount(typeAlerts, nowMs, config.HALF_LIFE_DAYS);
    return (alpha + observed) / (config.PRIOR_BETA_DAYS + exposure);
}

function computeStats(alerts, nowMs, config) {
    const { lambda: lambdaRegion, usableAlerts } = estimateRegionLambda(alerts, nowMs, config);
    if (!usableAlerts.length) return null;

    const sortedDesc = [...usableAlerts].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
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

    const windowStartMs = nowMs - config.WINDOW_DAYS * DAY_MS;
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

    const typeBreakdown = Array.from(byType.entries())
        .map(([type, typeAlerts]) => {
            const typeCount = typeAlerts.length;
            const lambdaType = estimateTypeLambda(typeAlerts, count, lambdaRegion, nowMs, config);

            const percent = Math.round((typeCount / count) * 100);
            const probabilityToday = Math.round((1 - Math.exp(-lambdaType)) * 100);
            const projectedNextMs = lambdaType > MIN_MEANINGFUL_LAMBDA ? (1 / lambdaType) * DAY_MS : null;

            return { type, count: typeCount, percent, projectedNextMs, probabilityToday };
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

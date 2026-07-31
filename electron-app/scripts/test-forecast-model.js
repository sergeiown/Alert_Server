const assert = require('assert');
const forecastConfig = require('../src/main/services/forecastConfig');
const { estimateRegionLambda, computeStats, DAY_MS } = require('../src/main/services/forecastModel');

function buildUniformAlerts(count, intervalDays, endMs) {
    const alerts = [];
    for (let i = 0; i < count; i++) {
        const startedAt = new Date(endMs - i * intervalDays * DAY_MS).toISOString();
        alerts.push({ id: i, alert_type: 'air_raid', started_at: startedAt, finished_at: startedAt, deleted_at: null });
    }
    return alerts;
}

function run(name, fn) {
    try {
        fn();
        console.log(`PASS: ${name}`);
    } catch (err) {
        console.error(`FAIL: ${name}`);
        console.error(err.message);
        process.exitCode = 1;
    }
}

const lastAlertMs = Date.parse('2026-01-01T00:00:00.000Z');
// 63 days = exactly 9 full weeks, so every weekday is equally represented and the seasonality
// multiplier is neutral (=1) throughout - these tests are about the recent/baseline mixture, not
// seasonality, which gets its own dedicated tests below.
const alerts = buildUniformAlerts(63, 1, lastAlertMs);

run('plateaus at baseline instead of unbounded growth after 5 days of silence', () => {
    const nowMs = lastAlertMs + 5 * DAY_MS;
    const { lambda, baselineLambda } = estimateRegionLambda(alerts, nowMs, forecastConfig);

    const etaMs = (1 / lambda) * DAY_MS;
    const ceilingEtaMs = (1 / baselineLambda) * DAY_MS;

    assert.ok(lambda > 0, 'lambda should still be positive');
    assert.ok(
        etaMs <= ceilingEtaMs * 1.001,
        `ETA (${(etaMs / 3600000).toFixed(2)}h) should not exceed the baseline ceiling (${(ceilingEtaMs / 3600000).toFixed(2)}h)`
    );
});

run('fresh alert: recentLambda dominates, matches pre-fix behavior', () => {
    const nowMs = lastAlertMs;
    const { lambda, recentLambda } = estimateRegionLambda(alerts, nowMs, forecastConfig);
    assert.ok(
        Math.abs(lambda - recentLambda) < 1e-9,
        `lambda (${lambda}) should equal recentLambda (${recentLambda}) right after an alert`
    );
});

run('monotonic during silence: never increases as silence continues, then plateaus', () => {
    const samples = [];
    for (let days = 0; days <= 30; days += 0.5) {
        const nowMs = lastAlertMs + days * DAY_MS;
        const { lambda } = estimateRegionLambda(alerts, nowMs, forecastConfig);
        samples.push(lambda);
    }

    for (let i = 1; i < samples.length; i++) {
        assert.ok(
            samples[i] <= samples[i - 1] + 1e-12,
            `lambda increased at sample ${i} (${samples[i]} > ${samples[i - 1]}) - should be non-increasing during silence`
        );
    }
});

run('no history at all still returns lambda 0 (no meaningful signal)', () => {
    const { lambda } = estimateRegionLambda([], lastAlertMs, forecastConfig);
    assert.strictEqual(lambda, 0);
});

// --- Seasonality ---

function buildWeekdayOnlyAlerts(weeks, targetWeekday, endMs) {
    // One alert per week, all on the same weekday, for `weeks` weeks - a region that only ever
    // alerts on e.g. Fridays.
    const alerts = [];
    const endWeekday = new Date(endMs).getUTCDay();
    const alignMs = endMs - ((endWeekday - targetWeekday + 7) % 7) * DAY_MS;
    for (let i = 0; i < weeks; i++) {
        const startedAt = new Date(alignMs - i * 7 * DAY_MS).toISOString();
        alerts.push({ id: i, alert_type: 'air_raid', started_at: startedAt, finished_at: startedAt, deleted_at: null });
    }
    return alerts;
}

run('seasonality: a region that only ever alerts on Fridays gets boosted on a Friday query', () => {
    const friday = 5;
    const endMs = Date.parse('2026-01-02T00:00:00.000Z'); // a Friday
    const weekdayAlerts = buildWeekdayOnlyAlerts(12, friday, endMs);

    const nowFriday = endMs;
    const nowSaturday = endMs + 1 * DAY_MS;

    const { seasonality: seasonalityOnFriday } = estimateRegionLambda(weekdayAlerts, nowFriday, forecastConfig);
    const { seasonality: seasonalityOnSaturday } = estimateRegionLambda(weekdayAlerts, nowSaturday, forecastConfig);

    assert.ok(
        seasonalityOnFriday > 1,
        `expected a Friday-only region to be boosted on a Friday query, got ${seasonalityOnFriday}`
    );
    assert.ok(
        seasonalityOnSaturday < 1,
        `expected a Friday-only region to be suppressed on a Saturday query, got ${seasonalityOnSaturday}`
    );
});

run('seasonality: never scales the estimate beyond SEASONALITY_MAX_MULTIPLIER either way', () => {
    const friday = 5;
    const endMs = Date.parse('2026-01-02T00:00:00.000Z');
    const weekdayAlerts = buildWeekdayOnlyAlerts(52, friday, endMs); // a full year of Friday-only history

    const { seasonality: onFriday } = estimateRegionLambda(weekdayAlerts, endMs, forecastConfig);
    const { seasonality: onSaturday } = estimateRegionLambda(weekdayAlerts, endMs + DAY_MS, forecastConfig);

    assert.ok(onFriday <= forecastConfig.SEASONALITY_MAX_MULTIPLIER + 1e-9, `Friday multiplier ${onFriday} exceeds the cap`);
    assert.ok(
        onSaturday >= 1 / forecastConfig.SEASONALITY_MAX_MULTIPLIER - 1e-9,
        `Saturday multiplier ${onSaturday} exceeds the cap`
    );
});

run('seasonality: shrinks toward neutral (1) with only a couple of same-weekday occurrences', () => {
    const friday = 5;
    const endMs = Date.parse('2026-01-02T00:00:00.000Z');
    const weekdayAlerts = buildWeekdayOnlyAlerts(2, friday, endMs); // only 2 occurrences ever

    const { seasonality } = estimateRegionLambda(weekdayAlerts, endMs, forecastConfig);
    assert.ok(
        seasonality < 1.5,
        `with only 2 same-weekday occurrences, the adjustment should be heavily shrunk, got ${seasonality}`
    );
});

// --- Uncertainty range (gapRange) ---

run('gapRange: omitted when there are fewer gaps than MIN_GAP_SAMPLES_FOR_RANGE', () => {
    const fewAlerts = buildUniformAlerts(forecastConfig.MIN_GAP_SAMPLES_FOR_RANGE, 1, lastAlertMs);
    const stats = computeStats(fewAlerts, lastAlertMs, forecastConfig);
    assert.strictEqual(stats.typeBreakdown[0].gapRange, null);
});

run('gapRange: present and low <= high once there is enough history', () => {
    const stats = computeStats(alerts, lastAlertMs, forecastConfig);
    const { gapRange } = stats.typeBreakdown[0];
    assert.ok(gapRange, 'expected a gapRange with 63 days of uniform daily alerts');
    assert.ok(gapRange.low <= gapRange.high, `expected low (${gapRange.low}) <= high (${gapRange.high})`);
    // Uniform 1/day data has every gap at exactly 1 day, so the 25th/75th percentile should both land there.
    assert.ok(Math.abs(gapRange.low - DAY_MS) < 1000, `expected low close to 1 day, got ${gapRange.low}`);
    assert.ok(Math.abs(gapRange.high - DAY_MS) < 1000, `expected high close to 1 day, got ${gapRange.high}`);
});

if (process.exitCode) {
    console.error('\nSome forecast model tests failed.');
} else {
    console.log('\nAll forecast model tests passed.');
}

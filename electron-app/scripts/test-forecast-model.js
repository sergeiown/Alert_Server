const assert = require('assert');
const forecastConfig = require('../src/main/services/forecastConfig');
const { estimateRegionLambda, DAY_MS } = require('../src/main/services/forecastModel');

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
const alerts = buildUniformAlerts(60, 1, lastAlertMs);

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

if (process.exitCode) {
    console.error('\nSome forecast model tests failed.');
} else {
    console.log('\nAll forecast model tests passed.');
}

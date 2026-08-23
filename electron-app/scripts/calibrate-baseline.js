// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const forecastConfig = require('../src/main/services/forecastConfig');
const { estimateRegionLambda } = require('../src/main/services/forecastModel');

const DAY_MS = 24 * 60 * 60 * 1000;
const TEST_SAMPLE_STRIDE_DAYS = 5;
const MIN_TRAIN_DAYS = 120;

const OBLAST_NAME_TO_UID = {
    'Vinnytska oblast': 4,
    'Volynska oblast': 8,
    'Dnipropetrovska oblast': 9,
    'Donetska oblast': 28,
    'Zhytomyrska oblast': 10,
    'Zakarpatska oblast': 11,
    'Zaporizka oblast': 12,
    'Ivano-Frankivska oblast': 13,
    'Kyivska oblast': 14,
    'Kirovohradska oblast': 15,
    'Luhanska oblast': 16,
    'Lvivska oblast': 27,
    'Kyiv City': 31,
    'Mykolaivska oblast': 17,
    'Odeska oblast': 18,
    'Poltavska oblast': 19,
    'Rivnenska oblast': 5,
    'Sumska oblast': 20,
    'Ternopilska oblast': 21,
    'Kharkivska oblast': 22,
    'Khersonska oblast': 23,
    'Khmelnytska oblast': 3,
    'Cherkaska oblast': 24,
    'Chernivetska oblast': 26,
    'Chernihivska oblast': 25,
};

const HALF_LIFE_CANDIDATES_DAYS = [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180];
function windowForHalfLife(halfLifeDays) {
    return Math.max(180, Math.round(halfLifeDays * 5));
}

const QUIET_RECENT_LAMBDA_THRESHOLD = 0.1;

function loadAlertsByUid(csvPath) {
    const text = fs.readFileSync(csvPath, 'utf-8');
    const lines = text.split('\n');
    const byUid = new Map();

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const commaIndex = line.indexOf(',');
        if (commaIndex === -1) continue;
        const oblastName = line.slice(0, commaIndex);
        const uid = OBLAST_NAME_TO_UID[oblastName];
        if (!uid) continue;

        const restFields = line.slice(commaIndex + 1).split(',');
        const startedAtRaw = restFields[3];
        if (!startedAtRaw) continue;
        const startedAtMs = new Date(startedAtRaw).getTime();
        if (Number.isNaN(startedAtMs)) continue;

        if (!byUid.has(uid)) byUid.set(uid, []);
        byUid.get(uid).push(startedAtMs);
    }

    byUid.forEach((times) => times.sort((a, b) => a - b));
    return byUid;
}

function occurredOnDay(sortedTimes, dayStart) {
    let lo = 0;
    let hi = sortedTimes.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sortedTimes[mid] < dayStart) lo = mid + 1;
        else hi = mid;
    }
    return lo < sortedTimes.length && sortedTimes[lo] < dayStart + DAY_MS;
}

function trainSlice(sortedTimes, dayStart) {
    let lo = 0;
    let hi = sortedTimes.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sortedTimes[mid] < dayStart) lo = mid + 1;
        else hi = mid;
    }
    // estimateRegionLambda only reads started_at (and an absent deleted_at) off each entry.
    return sortedTimes.slice(0, lo).map((ms) => ({ started_at: new Date(ms).toISOString() }));
}

function brierScore(trials) {
    return trials.reduce((sum, tr) => sum + (tr.p - tr.outcome) ** 2, 0) / trials.length;
}

function runCandidate(byUid, halfLifeDays, windowDays) {
    const config = { ...forecastConfig, BASELINE_HALF_LIFE_DAYS: halfLifeDays, BASELINE_WINDOW_DAYS: windowDays };
    const trials = [];

    byUid.forEach((sortedTimes) => {
        if (!sortedTimes.length) return;
        const firstMs = sortedTimes[0];
        const lastMs = sortedTimes[sortedTimes.length - 1];
        const firstDay = Math.floor(firstMs / DAY_MS) * DAY_MS;
        const lastDay = Math.floor(lastMs / DAY_MS) * DAY_MS;

        for (
            let dayStart = firstDay + MIN_TRAIN_DAYS * DAY_MS;
            dayStart < lastDay;
            dayStart += TEST_SAMPLE_STRIDE_DAYS * DAY_MS
        ) {
            const trainAlerts = trainSlice(sortedTimes, dayStart);
            if (!trainAlerts.length) continue;

            const { lambda, recentLambda } = estimateRegionLambda(trainAlerts, dayStart, config);
            const p = 1 - Math.exp(-lambda);
            const outcome = occurredOnDay(sortedTimes, dayStart) ? 1 : 0;
            trials.push({ p, outcome, quiet: recentLambda < QUIET_RECENT_LAMBDA_THRESHOLD });
        }
    });

    const quietTrials = trials.filter((tr) => tr.quiet);
    return {
        overallScore: brierScore(trials),
        overallN: trials.length,
        quietScore: quietTrials.length ? brierScore(quietTrials) : null,
        quietN: quietTrials.length,
    };
}

function printReliabilityTable(byUid, halfLifeDays, windowDays) {
    const config = { ...forecastConfig, BASELINE_HALF_LIFE_DAYS: halfLifeDays, BASELINE_WINDOW_DAYS: windowDays };
    const buckets = Array.from({ length: 10 }, () => ({ sumP: 0, sumOutcome: 0, count: 0 }));

    byUid.forEach((sortedTimes) => {
        if (!sortedTimes.length) return;
        const firstDay = Math.floor(sortedTimes[0] / DAY_MS) * DAY_MS;
        const lastDay = Math.floor(sortedTimes[sortedTimes.length - 1] / DAY_MS) * DAY_MS;

        for (
            let dayStart = firstDay + MIN_TRAIN_DAYS * DAY_MS;
            dayStart < lastDay;
            dayStart += TEST_SAMPLE_STRIDE_DAYS * DAY_MS
        ) {
            const trainAlerts = trainSlice(sortedTimes, dayStart);
            if (!trainAlerts.length) continue;

            const { lambda, recentLambda } = estimateRegionLambda(trainAlerts, dayStart, config);
            if (recentLambda >= QUIET_RECENT_LAMBDA_THRESHOLD) continue;

            const p = 1 - Math.exp(-lambda);
            const outcome = occurredOnDay(sortedTimes, dayStart) ? 1 : 0;
            const index = Math.min(9, Math.floor(p * 10));
            buckets[index].sumP += p;
            buckets[index].sumOutcome += outcome;
            buckets[index].count++;
        }
    });

    buckets.forEach((bucket, i) => {
        if (!bucket.count) return;
        const avgP = (bucket.sumP / bucket.count) * 100;
        const avgOutcome = (bucket.sumOutcome / bucket.count) * 100;
        console.log(
            `  ${i * 10}-${i * 10 + 10}%: прогноз ${avgP.toFixed(0)}%, факт ${avgOutcome.toFixed(0)}% (n=${bucket.count})`
        );
    });
}

function main() {
    const csvPath = process.argv[2];
    if (!csvPath) {
        console.error('Використання: node scripts/calibrate-baseline.js path/to/official_data_en.csv');
        process.exit(1);
    }

    console.log('Завантажую та групую історію по областях...');
    const byUid = loadAlertsByUid(csvPath);
    const totalRows = Array.from(byUid.values()).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`Областей з даними: ${byUid.size}, всього подій: ${totalRows}`);

    const candidates = [
        { halfLifeDays: forecastConfig.BASELINE_HALF_LIFE_DAYS, windowDays: forecastConfig.BASELINE_WINDOW_DAYS, label: 'поточні (21/90)' },
        ...HALF_LIFE_CANDIDATES_DAYS.map((halfLifeDays) => ({
            halfLifeDays,
            windowDays: windowForHalfLife(halfLifeDays),
        })),
    ];

    console.log('\n--- Brier score по кандидатах (менше - краще; "тихі" - лише коли baseline і вирішує) ---');
    const results = candidates.map((c) => {
        const r = runCandidate(byUid, c.halfLifeDays, c.windowDays);
        const quietText = r.quietScore !== null ? `${r.quietScore.toFixed(5)} (n=${r.quietN})` : 'н/д';
        console.log(
            `half-life=${c.halfLifeDays}д, window=${c.windowDays}д${c.label ? ` [${c.label}]` : ''}: загальний ${r.overallScore.toFixed(5)} (n=${r.overallN}), тихі ${quietText}`
        );
        return { ...c, ...r };
    });

    const withQuiet = results.filter((r) => r.quietScore !== null);
    const best = withQuiet.reduce((a, b) => (b.quietScore < a.quietScore ? b : a));
    console.log(`\nНайкращий (за "тихою" підмножиною): half-life=${best.halfLifeDays}д, window=${best.windowDays}д (Brier ${best.quietScore.toFixed(5)})`);

    console.log('\n--- Reliability-таблиця ("тиха" підмножина, найкращий кандидат) ---');
    printReliabilityTable(byUid, best.halfLifeDays, best.windowDays);
}

main();

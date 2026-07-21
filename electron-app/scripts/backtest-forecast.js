const fs = require('fs');
const os = require('os');
const path = require('path');
const forecastConfig = require('../src/main/services/forecastConfig');
const { filterUsableAlerts, estimateRegionLambda } = require('../src/main/services/forecastModel');

const PROXY_URL = 'https://alert-proxy.alert-proxy-ua.workers.dev';
const MIN_ORIGIN_GAP_MS = 32000;
const WALK_FORWARD_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const RAW_CACHE_PATH = path.join(os.tmpdir(), 'alert-server-backtest-raw-cache.json');
const RAW_CACHE_TTL_MS = 60 * 60 * 1000;

let lastFetchAt = 0;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadRawCache() {
    if (!fs.existsSync(RAW_CACHE_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(RAW_CACHE_PATH, 'utf-8'));
    } catch {
        return {};
    }
}

function saveRawCache(cache) {
    fs.writeFileSync(RAW_CACHE_PATH, JSON.stringify(cache), 'utf-8');
}

async function fetchHistoryCached(uid, clientKey, cache) {
    const cached = cache[uid];
    if (cached && Date.now() - cached.fetchedAt < RAW_CACHE_TTL_MS) {
        return cached.alerts;
    }

    const waitMs = Math.max(0, MIN_ORIGIN_GAP_MS - (Date.now() - lastFetchAt));
    if (waitMs > 0) await delay(waitMs);
    lastFetchAt = Date.now();

    const response = await fetch(`${PROXY_URL}/history/${uid}`, { headers: { 'X-Client-Key': clientKey } });
    if (!response.ok) {
        console.error(`Регіон ${uid}: запит історії не вдався (${response.status})`);
        return [];
    }
    const data = await response.json();
    const alerts = data.alerts || [];
    cache[uid] = { fetchedAt: Date.now(), alerts };
    saveRawCache(cache);
    return alerts;
}

function occurredOnDay(alerts, dayStart) {
    return alerts.some((a) => {
        const t = new Date(a.started_at).getTime();
        return t >= dayStart && t < dayStart + DAY_MS;
    });
}

function baseRateProbability(trainAlerts, config) {
    const perDay = trainAlerts.length / config.WINDOW_DAYS;
    return 1 - Math.exp(-perDay);
}

function persistenceProbability(trainAlerts, dayStart, config) {
    const days = [];
    for (let d = config.WINDOW_DAYS; d >= 1; d--) {
        const start = dayStart - d * DAY_MS;
        days.push(occurredOnDay(trainAlerts, start));
    }

    let followOccurred = 0;
    let followTotal = 0;
    let followNoOccurred = 0;
    let followNoTotal = 0;
    for (let i = 1; i < days.length; i++) {
        if (days[i - 1]) {
            followTotal++;
            if (days[i]) followOccurred++;
        } else {
            followNoTotal++;
            if (days[i]) followNoOccurred++;
        }
    }

    const yesterdayOccurred = days[days.length - 1];
    if (yesterdayOccurred) return followTotal > 0 ? followOccurred / followTotal : 0.5;
    return followNoTotal > 0 ? followNoOccurred / followNoTotal : 0.5;
}

function oldModelProbability(trainAlerts, dayStart, config) {
    const windowStart = dayStart - config.WINDOW_DAYS * DAY_MS;
    const weekdayOccurrences = [0, 0, 0, 0, 0, 0, 0];
    for (let d = 0; d < config.WINDOW_DAYS; d++) {
        const day = new Date(windowStart + d * DAY_MS).getDay();
        weekdayOccurrences[day]++;
    }

    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
    trainAlerts.forEach((a) => {
        const day = new Date(a.started_at).getDay();
        weekdayCounts[day]++;
    });

    const weekdayRates = weekdayCounts.map((c, i) => c / Math.max(1, weekdayOccurrences[i]));
    const rate = weekdayRates[new Date(dayStart).getDay()];
    return 1 - Math.exp(-rate);
}

function newModelProbability(trainAlerts, dayStart, config) {
    const { lambda } = estimateRegionLambda(trainAlerts, dayStart, config);
    return 1 - Math.exp(-lambda);
}

function brierScore(trials) {
    return trials.reduce((sum, tr) => sum + (tr.p - tr.outcome) ** 2, 0) / trials.length;
}

function printReliabilityTable(trials) {
    const buckets = Array.from({ length: 10 }, () => ({ sumP: 0, sumOutcome: 0, count: 0 }));
    trials.forEach(({ p, outcome }) => {
        const index = Math.min(9, Math.floor(p * 10));
        buckets[index].sumP += p;
        buckets[index].sumOutcome += outcome;
        buckets[index].count++;
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

async function main() {
    const localConfigPath = path.join(__dirname, '..', 'resources', 'config.local.json');
    if (!fs.existsSync(localConfigPath)) {
        console.error('Не знайдено resources/config.local.json - alertProxyClientKey потрібен для бектесту.');
        process.exit(1);
    }
    const { alertProxyClientKey } = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));

    const locationsPath = path.join(__dirname, '..', 'resources', 'data', 'locations.json');
    const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf-8'));
    const regionUids = locations.states.map((s) => s.uid);

    const now = Date.now();
    const todayStart = new Date(now).setHours(0, 0, 0, 0);

    const trials = { base: [], persistence: [], old: [], new: [] };
    const rawCache = loadRawCache();

    for (const uid of regionUids) {
        console.log(`Отримую історію для регіону ${uid}...`);
        const rawAlerts = await fetchHistoryCached(uid, alertProxyClientKey, rawCache);
        const alerts = filterUsableAlerts(rawAlerts);
        if (!alerts.length) continue;

        for (let k = WALK_FORWARD_DAYS; k >= 1; k--) {
            const dayStart = todayStart - k * DAY_MS;
            const trainAlerts = alerts.filter((a) => new Date(a.started_at).getTime() < dayStart);
            if (!trainAlerts.length) continue;

            const outcome = occurredOnDay(alerts, dayStart) ? 1 : 0;

            trials.base.push({ p: baseRateProbability(trainAlerts, forecastConfig), outcome });
            trials.persistence.push({ p: persistenceProbability(trainAlerts, dayStart, forecastConfig), outcome });
            trials.old.push({ p: oldModelProbability(trainAlerts, dayStart, forecastConfig), outcome });
            trials.new.push({ p: newModelProbability(trainAlerts, dayStart, forecastConfig), outcome });
        }
    }

    console.log('\n--- Brier score (менше - краще) ---');
    const labels = { base: 'завжди базова частота', persistence: 'повторити вчора', old: 'стара формула', new: 'нова формула' };
    Object.entries(trials).forEach(([name, list]) => {
        if (!list.length) {
            console.log(`${labels[name]}: немає випробувань`);
            return;
        }
        console.log(`${labels[name]}: ${brierScore(list).toFixed(4)} (n=${list.length})`);
    });

    console.log('\n--- Reliability-таблиця (нова формула) ---');
    printReliabilityTable(trials.new);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

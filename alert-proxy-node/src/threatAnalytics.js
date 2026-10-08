// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const archive = require('./archive');
const lib = require('./lib');

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_DAYS = 7;
const MAX_DAYS = 90;
const WAVE_GAP_MS = 60 * 60 * 1000;
const LEAD_WINDOW_MS = 90 * 60 * 1000;
const MIN_ROUTE_DURATION_MS = 5 * 60 * 1000;
const TOP_ORIGINS = 12;
const TOP_ROUTES = 12;
const TOP_ALERT_REGIONS = 12;
const MIN_WAVES_PER_REGION = 3;
const UKRAINE_CENTER = { lat: 48.4, lon: 31.2 };
const SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const MISSILE_ALIASES = new Set(['missile', 'rocket', 'cruise_missile', 'ballistic']);

const cache = new Map();

function normalizeType(type) {
    if (!type) return 'unknown';
    if (type === 'recon') return 'uav_recon';
    if (MISSILE_ALIASES.has(type)) return 'missile';
    return type;
}

function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sectorOf(lat, lon) {
    const dy = lat - UKRAINE_CENTER.lat;
    const dx = (lon - UKRAINE_CENTER.lon) * Math.cos((UKRAINE_CENTER.lat * Math.PI) / 180);
    const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
    return SECTORS[Math.round(((bearing + 360) % 360) / 45) % 8];
}

function addCount(map, key, type) {
    if (!map.has(key)) map.set(key, { count: 0, byType: {} });
    const entry = map.get(key);
    entry.count += 1;
    entry.byType[type] = (entry.byType[type] || 0) + 1;
}

function buildPerDay(threats, days) {
    const perDay = new Map();
    for (let i = days - 1; i >= 0; i--) {
        perDay.set(lib.kyivDateKey(new Date(Date.now() - i * DAY_MS)), { date: null, total: 0, byType: {} });
    }
    perDay.forEach((entry, key) => {
        entry.date = key;
    });

    threats.forEach((threat) => {
        const entry = perDay.get(lib.kyivDateKey(new Date(threat.first_seen)));
        if (!entry) return;
        entry.total += 1;
        entry.byType[threat.kind] = (entry.byType[threat.kind] || 0) + 1;
    });
    return [...perDay.values()];
}

function buildByHour(threats) {
    const total = new Array(24).fill(0);
    const byType = {};
    threats.forEach((threat) => {
        const hour = lib.kyivHour(new Date(threat.first_seen).toISOString());
        total[hour] += 1;
        if (!byType[threat.kind]) byType[threat.kind] = new Array(24).fill(0);
        byType[threat.kind][hour] += 1;
    });
    return { total, byType };
}

function buildOrigins(threats) {
    const known = threats.filter((threat) => threat.first_region);
    const regions = new Map();
    const sectors = new Map();
    known.forEach((threat) => {
        addCount(regions, threat.first_region, threat.kind);
        if (Number.isFinite(threat.first_lat) && Number.isFinite(threat.first_lon)) {
            addCount(sectors, sectorOf(threat.first_lat, threat.first_lon), threat.kind);
        }
    });

    return {
        sampleSize: known.length,
        regions: [...regions.entries()]
            .map(([region, entry]) => ({ region, ...entry }))
            .sort((a, b) => b.count - a.count)
            .slice(0, TOP_ORIGINS),
        sectors: SECTORS.map((sector) => ({ sector, ...(sectors.get(sector) || { count: 0, byType: {} }) })),
    };
}

function buildRoutes(threats) {
    const pairs = new Map();
    threats.forEach((threat) => {
        if (!threat.first_region || !threat.last_region || threat.first_region === threat.last_region) return;
        const duration = threat.last_seen - threat.first_seen;
        if (duration < MIN_ROUTE_DURATION_MS) return;
        const key = `${threat.first_region}|${threat.last_region}`;
        if (!pairs.has(key)) pairs.set(key, { from: threat.first_region, to: threat.last_region, count: 0, byType: {}, durations: [] });
        const entry = pairs.get(key);
        entry.count += 1;
        entry.byType[threat.kind] = (entry.byType[threat.kind] || 0) + 1;
        entry.durations.push(duration);
    });

    return [...pairs.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_ROUTES)
        .map((entry) => ({
            from: entry.from,
            to: entry.to,
            count: entry.count,
            byType: entry.byType,
            medianMinutes: Math.round(median(entry.durations) / 60000),
        }));
}

function buildAlertLinks(threats, sinceIso) {
    const startsByRegion = new Map();
    archive.getAlertStartsSince(sinceIso).forEach((row) => {
        const startedMs = new Date(row.started_at).getTime();
        if (!Number.isFinite(startedMs)) return;
        if (!startsByRegion.has(row.location_oblast)) startsByRegion.set(row.location_oblast, []);
        startsByRegion.get(row.location_oblast).push(startedMs);
    });

    const threatsByRegion = new Map();
    threats.forEach((threat) => {
        [threat.first_region, threat.last_region].forEach((region) => {
            if (!region) return;
            if (!threatsByRegion.has(region)) threatsByRegion.set(region, new Set());
            threatsByRegion.get(region).add(threat);
        });
    });

    const perRegion = [];
    let waves = 0;
    let wavesWithThreat = 0;
    const allLeads = [];

    startsByRegion.forEach((starts, region) => {
        starts.sort((a, b) => a - b);
        const waveStarts = starts.filter((start, index) => index === 0 || start - starts[index - 1] > WAVE_GAP_MS);
        const regionThreats = [...(threatsByRegion.get(region) || [])];
        const leads = [];
        let linked = 0;

        waveStarts.forEach((start) => {
            const preceding = regionThreats.filter((threat) => threat.first_seen < start && threat.first_seen >= start - LEAD_WINDOW_MS && threat.last_seen >= start - LEAD_WINDOW_MS);
            if (!preceding.length) return;
            linked += 1;
            leads.push(start - Math.max(...preceding.map((threat) => threat.first_seen)));
        });

        waves += waveStarts.length;
        wavesWithThreat += linked;
        allLeads.push(...leads);
        if (waveStarts.length >= MIN_WAVES_PER_REGION) {
            perRegion.push({
                region,
                waves: waveStarts.length,
                withThreat: linked,
                share: linked / waveStarts.length,
                medianLeadMinutes: leads.length ? Math.round(median(leads) / 60000) : null,
            });
        }
    });

    return {
        waves,
        withThreat: wavesWithThreat,
        share: waves ? wavesWithThreat / waves : null,
        medianLeadMinutes: allLeads.length ? Math.round(median(allLeads) / 60000) : null,
        byRegion: perRegion.sort((a, b) => b.waves - a.waves).slice(0, TOP_ALERT_REGIONS),
    };
}

function compute(days) {
    const sinceMs = Date.now() - days * DAY_MS;
    const threats = archive.getThreatsSince(sinceMs).map((row) => ({ ...row, kind: normalizeType(row.type) }));

    const totalsByType = {};
    const titles = {};
    threats.forEach((threat) => {
        totalsByType[threat.kind] = (totalsByType[threat.kind] || 0) + 1;
        if (threat.title && !titles[threat.kind]) titles[threat.kind] = threat.title;
    });

    const track = archive.getTrackStats();
    const originsSince = threats.find((threat) => threat.first_region);

    return {
        generatedAt: new Date().toISOString(),
        days,
        totals: { threats: threats.length, byType: totalsByType },
        titles,
        perDay: buildPerDay(threats, days),
        byHour: buildByHour(threats),
        origins: { ...buildOrigins(threats), since: originsSince ? new Date(originsSince.first_seen).toISOString() : null },
        routes: buildRoutes(threats),
        alertLinks: buildAlertLinks(threats, new Date(sinceMs).toISOString()),
        tracking: { points: track.points, since: track.oldest ? new Date(track.oldest).toISOString() : null },
    };
}

function getThreatAnalytics(requestedDays) {
    const days = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Number(requestedDays) || 30));
    const cached = cache.get(days);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

    const data = compute(days);
    cache.set(days, { at: Date.now(), data });
    return data;
}

module.exports = { getThreatAnalytics };

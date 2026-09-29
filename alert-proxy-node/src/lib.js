// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const TODAY_STATS_TIMEZONE = 'Europe/Kyiv';

const ALL_OBLAST_UIDS = [
    3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31,
];

const UKRAINEALARM_TYPE_MAP = {
    AIR: 'air_raid',
    ARTILLERY: 'artillery_shelling',
    URBAN_FIGHTS: 'urban_fights',
    CHEMICAL: 'chemical',
    NUCLEAR: 'nuclear',
};

function kyivDateKey(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TODAY_STATS_TIMEZONE }).format(date);
}

function kyivHour(dateStr) {
    const formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone: TODAY_STATS_TIMEZONE,
        hour: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(dateStr));
    return Number(formatted);
}

async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function hashIp(ip) {
    return (await sha256Hex(ip)).slice(0, 16);
}

async function importUkraineAlarmWebhookPublicKey(pem) {
    const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----/, '').replace(/-----END PUBLIC KEY-----/, '').replace(/\s+/g, '');
    const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('spki', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function verifyUkraineAlarmWebhookSignature(publicKeyPem, signatureBase64, canonicalString) {
    const key = await importUkraineAlarmWebhookPublicKey(publicKeyPem);
    const signatureBytes = Uint8Array.from(atob(signatureBase64), (c) => c.charCodeAt(0));
    const dataBytes = new TextEncoder().encode(canonicalString);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, dataBytes);
}

function pruneAndCount(timestamps, now, windowMs) {
    while (timestamps.length && now - timestamps[0] > windowMs) timestamps.shift();
    return timestamps.length;
}

function parseDotNetDurationMs(duration) {
    const dotIndex = duration.indexOf('.');
    const hasDayPrefix = dotIndex !== -1 && duration.slice(0, dotIndex).match(/^\d+$/) && duration.includes(':');
    const days = hasDayPrefix ? Number(duration.slice(0, dotIndex)) : 0;
    const rest = hasDayPrefix ? duration.slice(dotIndex + 1) : duration;
    const [hours, minutes, secondsPart] = rest.split(':');
    const seconds = parseFloat(secondsPart) || 0;
    return (((days * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + seconds) * 1000;
}

function worstUkraineAlarmLevel(activeAlertLevels) {
    if (activeAlertLevels.some((l) => (l.alertLevel || '').toLowerCase() === 'red')) return 'red';
    if (activeAlertLevels.length) return 'yellow';
    return null;
}

function mapUkraineAlarmThreats(activeAlertLevels) {
    return activeAlertLevels.map((l) => ({
        threat_type: null,
        level: l.alertLevel ? l.alertLevel.toLowerCase() : null,
        started_at: l.createdAt || null,
        source_message: l.reason || null,
    }));
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else {
            field += ch;
        }
    }
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }

    const header = rows[0];
    return rows.slice(1).map((cells) => {
        const record = {};
        header.forEach((key, index) => (record[key] = cells[index]));
        return record;
    });
}

function kaggleAuthHeader(kaggleToken, kaggleUsername, kaggleKey) {
    if (kaggleToken) return `Bearer ${kaggleToken}`;
    return `Basic ${btoa(`${kaggleUsername}:${kaggleKey}`)}`;
}

async function fetchKaggleCsv(kaggleToken, kaggleUsername, kaggleKey, dataset, fileName) {
    const url = `https://www.kaggle.com/api/v1/datasets/download/${dataset}?file_name=${fileName}`;
    const response = await fetch(url, { headers: { Authorization: kaggleAuthHeader(kaggleToken, kaggleUsername, kaggleKey) } });
    if (!response.ok) {
        throw new Error(`Kaggle ${fileName}: ${response.status} ${await response.text()}`);
    }
    return parseCsv(await response.text());
}

function buildWeaponStats(attacks, models, topModels) {
    const categoryByModel = new Map(models.map((m) => [m.model, m.category || 'unknown']));

    const totals = { launched: 0, destroyed: 0 };
    const byCategory = new Map();
    const byModel = new Map();
    const byMonth = new Map();
    let minDate = null;
    let maxDate = null;

    attacks.forEach((row) => {
        const launched = Number(row.launched) || 0;
        const destroyed = Number(row.destroyed) || 0;
        const model = row.model || 'Unknown';
        const category = categoryByModel.get(model) || 'unknown';
        const dateStr = (row.time_start || '').slice(0, 10);
        const month = dateStr.slice(0, 7);
        if (!dateStr) return;

        if (!minDate || dateStr < minDate) minDate = dateStr;
        if (!maxDate || dateStr > maxDate) maxDate = dateStr;

        totals.launched += launched;
        totals.destroyed += destroyed;

        if (!byCategory.has(category)) byCategory.set(category, { category, launched: 0, destroyed: 0 });
        const categoryEntry = byCategory.get(category);
        categoryEntry.launched += launched;
        categoryEntry.destroyed += destroyed;

        if (!byModel.has(model)) byModel.set(model, { model, category, launched: 0, destroyed: 0 });
        const modelEntry = byModel.get(model);
        modelEntry.launched += launched;
        modelEntry.destroyed += destroyed;

        if (!byMonth.has(month)) byMonth.set(month, { month, launched: 0, destroyed: 0, categories: {} });
        const monthEntry = byMonth.get(month);
        monthEntry.launched += launched;
        monthEntry.destroyed += destroyed;
        monthEntry.categories[category] = (monthEntry.categories[category] || 0) + launched;
    });

    return {
        generatedAt: new Date().toISOString(),
        dateRange: { from: minDate, to: maxDate },
        totals,
        byCategory: Array.from(byCategory.values()).sort((a, b) => b.launched - a.launched),
        byModel: Array.from(byModel.values())
            .sort((a, b) => b.launched - a.launched)
            .slice(0, topModels),
        monthly: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
    };
}

module.exports = {
    ALL_OBLAST_UIDS,
    UKRAINEALARM_TYPE_MAP,
    kyivDateKey,
    kyivHour,
    sha256Hex,
    hashIp,
    verifyUkraineAlarmWebhookSignature,
    pruneAndCount,
    parseDotNetDurationMs,
    worstUkraineAlarmLevel,
    mapUkraineAlarmThreats,
    delay,
    fetchKaggleCsv,
    buildWeaponStats,
};

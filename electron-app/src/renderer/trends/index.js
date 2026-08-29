// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { normalizeOblastName, oblastDisplayName, normalizeRaionName, raionDisplayName } from '../liveMap/regionNameUtils.js';
import { transliterate } from '../liveMap/transliterate.js';

const KYIV_RAW_NAME = 'м. Київ';

const CATEGORY_UK = {
    UAV: 'БПЛА',
    'cruise missile': 'крилата ракета',
    'ballistic missile': 'балістична ракета',
    'surface-to-air missile': 'ракета ППО',
    'surface-to-air and ballistic': 'ППО/балістична',
    'guided bomb': 'керована авіабомба',
    unknown: 'невідомо',
};

const CATEGORY_COLOR = {
    UAV: '#f5a623',
    'cruise missile': '#991b1b',
    'ballistic missile': '#7c3aed',
    'surface-to-air missile': '#0d9488',
    'surface-to-air and ballistic': '#5b8fb0',
    'guided bomb': '#dc2626',
    unknown: '#6b7280',
};
const FALLBACK_COLOR = '#94a3b8';

function categoryName(category, isEnglish) {
    if (isEnglish) return category;
    return CATEGORY_UK[category] || category;
}

function categoryColor(category) {
    return CATEGORY_COLOR[category] || FALLBACK_COLOR;
}

function formatNumber(n) {
    return Math.round(n).toLocaleString();
}

// Oblast names get the same curated English names the live map already uses (e.g. "Dnipropetrovsk
// Oblast", not a mechanical transliteration of the Ukrainian).
function displayOblastName(name, isEnglish) {
    if (!isEnglish || !name) return name;
    return oblastDisplayName(normalizeOblastName(name), true);
}

// Monitored-location names can be at any granularity - oblast (Kyiv city itself, monitored as its
// own region), raion, hromada, or city - each with its own curated map only for the first two
// (same ones the live map already uses); a hromada/city name has no such map at all, so that case
// falls back to plain transliteration instead - not as polished, but never left in Cyrillic under
// an English UI.
function displayLocationName(name, isEnglish) {
    if (!isEnglish || !name) return name;
    if (name === KYIV_RAW_NAME) return oblastDisplayName('Київ', true);
    if (/область$/u.test(name)) return oblastDisplayName(normalizeOblastName(name), true);
    if (/район$/u.test(name)) return raionDisplayName(normalizeRaionName(name), true);
    // "м. " ("misto", city) is a Ukrainian abbreviation with no place left in an English name -
    // transliterating the rest without it, rather than leaving the raw Cyrillic-abbreviation
    // prefix sitting in front of an otherwise-English name (e.g. "m. Kharkiv").
    return transliterate(name.replace(/^м\.\s*/u, ''));
}

function formatPercent(numerator, denominator) {
    if (!denominator) return '-';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

function monthLabel(month, isEnglish) {
    const [year, m] = month.split('-');
    const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
    return date.toLocaleDateString(isEnglish ? 'en-US' : 'uk-UA', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function buildSummaryCard(stats, strings) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsSummaryTitle;
    card.appendChild(h2);

    const row = document.createElement('div');
    row.id = 'summaryRow';

    const tiles = [
        { value: formatNumber(stats.totals.launched), label: strings.trendsLaunched },
        { value: formatNumber(stats.totals.destroyed), label: strings.trendsDestroyed },
        { value: formatPercent(stats.totals.destroyed, stats.totals.launched), label: strings.trendsInterceptionRate },
    ];
    tiles.forEach(({ value, label }) => {
        const tile = document.createElement('div');
        tile.className = 'stat-tile';
        tile.innerHTML = `<div class="value">${value}</div><div class="label">${label}</div>`;
        row.appendChild(tile);
    });

    card.appendChild(row);
    return card;
}

function buildCategoryCard(stats, strings, isEnglish) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsByCategoryTitle;
    card.appendChild(h2);

    const table = document.createElement('table');
    table.innerHTML = `
        <thead><tr>
            <th>${strings.trendsCategory}</th>
            <th class="numeric">${strings.trendsLaunched}</th>
            <th class="numeric">${strings.trendsDestroyed}</th>
            <th class="numeric">${strings.trendsInterceptionRate}</th>
        </tr></thead>`;
    const tbody = document.createElement('tbody');
    stats.byCategory.forEach((entry) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="swatch" style="background:${categoryColor(entry.category)}"></span>${categoryName(entry.category, isEnglish)}</td>
            <td class="numeric">${formatNumber(entry.launched)}</td>
            <td class="numeric">${formatNumber(entry.destroyed)}</td>
            <td class="numeric">${formatPercent(entry.destroyed, entry.launched)}</td>`;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    return card;
}

function buildMonthlyChart(stats, strings, isEnglish) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsMonthlyTitle;
    card.appendChild(h2);

    const months = stats.monthly;
    const categories = stats.byCategory.map((c) => c.category);
    const maxLaunched = Math.max(1, ...months.map((m) => m.launched));

    const barWidth = 14;
    const gap = 4;
    const chartHeight = 200;
    const width = months.length * (barWidth + gap) + gap;
    const height = chartHeight + 24;

    const svgParts = [];
    months.forEach((entry, index) => {
        const x = gap + index * (barWidth + gap);
        let yCursor = chartHeight;
        categories.forEach((category) => {
            const value = entry.categories[category] || 0;
            if (!value) return;
            const barHeight = (value / maxLaunched) * chartHeight;
            yCursor -= barHeight;
            svgParts.push(
                `<rect x="${x}" y="${yCursor.toFixed(1)}" width="${barWidth}" height="${barHeight.toFixed(1)}" fill="${categoryColor(category)}"><title>${monthLabel(entry.month, isEnglish)}: ${categoryName(category, isEnglish)} - ${formatNumber(value)}</title></rect>`
            );
        });
        if (index % 6 === 0) {
            svgParts.push(
                `<text x="${x + barWidth / 2}" y="${chartHeight + 16}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.7">${monthLabel(entry.month, isEnglish)}</text>`
            );
        }
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'chart-scroll';
    wrapper.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="color:var(--fg)">${svgParts.join('')}</svg>`;
    card.appendChild(wrapper);

    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    categories.forEach((category) => {
        const item = document.createElement('span');
        item.innerHTML = `<span class="swatch" style="background:${categoryColor(category)}"></span>${categoryName(category, isEnglish)}`;
        legend.appendChild(item);
    });
    card.appendChild(legend);

    return card;
}

function buildModelsCard(stats, strings, isEnglish) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsTopModelsTitle;
    card.appendChild(h2);

    const table = document.createElement('table');
    table.innerHTML = `
        <thead><tr>
            <th>${strings.trendsModel}</th>
            <th>${strings.trendsCategory}</th>
            <th class="numeric">${strings.trendsLaunched}</th>
            <th class="numeric">${strings.trendsDestroyed}</th>
            <th class="numeric">${strings.trendsInterceptionRate}</th>
        </tr></thead>`;
    const tbody = document.createElement('tbody');
    stats.byModel.forEach((entry) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${entry.model}</td>
            <td>${categoryName(entry.category, isEnglish)}</td>
            <td class="numeric">${formatNumber(entry.launched)}</td>
            <td class="numeric">${formatNumber(entry.destroyed)}</td>
            <td class="numeric">${formatPercent(entry.destroyed, entry.launched)}</td>`;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    return card;
}

function buildTodayAlertsCard(total, strings) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsTodayAlertsTitle;
    card.appendChild(h2);

    const row = document.createElement('div');
    row.id = 'summaryRow';
    const tile = document.createElement('div');
    tile.className = 'stat-tile';
    tile.innerHTML = `<div class="value">${formatNumber(total)}</div><div class="label">${strings.trendsTodayAlertsLabel}</div>`;
    row.appendChild(tile);
    card.appendChild(row);
    return card;
}

function buildHourlyChart(byHour, strings) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsTodayByHourTitle;
    card.appendChild(h2);

    const barWidth = 18;
    const gap = 4;
    const chartHeight = 120;
    const width = 24 * (barWidth + gap) + gap;
    const height = chartHeight + 20;
    const maxCount = Math.max(1, ...byHour);

    const svgParts = [];
    byHour.forEach((count, hour) => {
        const x = gap + hour * (barWidth + gap);
        const barHeight = (count / maxCount) * chartHeight;
        svgParts.push(
            `<rect x="${x}" y="${(chartHeight - barHeight).toFixed(1)}" width="${barWidth}" height="${barHeight.toFixed(1)}" fill="#2563eb"><title>${hour}:00 - ${count}</title></rect>`
        );
        if (hour % 3 === 0) {
            svgParts.push(
                `<text x="${x + barWidth / 2}" y="${chartHeight + 14}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.7">${hour}</text>`
            );
        }
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'chart-scroll';
    wrapper.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="color:var(--fg)">${svgParts.join('')}</svg>`;
    card.appendChild(wrapper);
    return card;
}

function buildCountTable(entries, titleKey, columnKey, strings, emptyKey) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings[titleKey];
    card.appendChild(h2);

    if (!entries.length) {
        const p = document.createElement('p');
        p.className = 'muted-note';
        p.textContent = strings[emptyKey];
        card.appendChild(p);
        return card;
    }

    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>${strings[columnKey]}</th><th class="numeric">${strings.trendsTodayAlertsLabel}</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    entries.forEach(({ label, count }) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${label}</td><td class="numeric">${formatNumber(count)}</td>`;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    return card;
}

function buildTabs(strings, onSelect) {
    const bar = document.createElement('div');
    bar.id = 'tabsHost';

    const allTimeTab = document.createElement('button');
    allTimeTab.className = 'tab active';
    allTimeTab.textContent = strings.trendsTabAllTime;

    const todayTab = document.createElement('button');
    todayTab.className = 'tab';
    todayTab.textContent = strings.trendsTabToday;

    [
        [allTimeTab, todayTab, 'allTime'],
        [todayTab, allTimeTab, 'today'],
    ].forEach(([active, inactive, key]) => {
        active.addEventListener('click', () => {
            active.classList.add('active');
            inactive.classList.remove('active');
            onSelect(key);
        });
    });

    bar.appendChild(allTimeTab);
    bar.appendChild(todayTab);
    return bar;
}

async function main() {
    const strings = await window.alertServerTrends.getStrings();
    const settings = await window.alertServerTrends.getSettings();
    const isEnglish = settings.language === 'English';

    document.title = strings.trendsWindowTitle;
    document.getElementById('trendsHeader').textContent = strings.trendsHeader;

    const content = document.getElementById('content');
    // Independent of each other - the Today tab (this app's own alert-count tracking) has nothing
    // to do with the Kaggle-sourced weapon stats, so one failing to load must not take the other
    // tab (or the tab bar itself) down with it - each is fetched in its own try/catch rather than
    // letting an IPC rejection abort main() before the tabs are even built.
    const stats = await window.alertServerTrends.getWeaponStats().catch(() => null);
    const todayStats = await window.alertServerTrends
        .getTodayStats()
        .catch(() => ({ total: 0, byHour: Array.from({ length: 24 }, () => 0), byOblast: [], byMonitoredLocation: [] }));

    if (stats) {
        const rangeText = strings.trendsRangeLabel
            .replace('{from}', stats.dateRange.from)
            .replace('{to}', stats.dateRange.to);
        document.getElementById('trendsRange').textContent = rangeText;
    }

    function renderAllTime() {
        content.innerHTML = '';
        if (!stats) {
            const p = document.createElement('p');
            p.id = 'errorText';
            p.textContent = strings.trendsNoData;
            content.appendChild(p);
            return;
        }
        content.appendChild(buildSummaryCard(stats, strings));
        content.appendChild(buildMonthlyChart(stats, strings, isEnglish));
        content.appendChild(buildCategoryCard(stats, strings, isEnglish));
        content.appendChild(buildModelsCard(stats, strings, isEnglish));
    }

    function renderToday() {
        content.innerHTML = '';
        content.appendChild(buildTodayAlertsCard(todayStats.total, strings));
        content.appendChild(buildHourlyChart(todayStats.byHour, strings));
        content.appendChild(
            buildCountTable(
                todayStats.byOblast.map((e) => ({ label: displayOblastName(e.oblast, isEnglish), count: e.count })),
                'trendsTodayByOblastTitle',
                'trendsTodayOblastColumn',
                strings,
                'trendsTodayNoAlerts'
            )
        );
        content.appendChild(
            buildCountTable(
                todayStats.byMonitoredLocation.map((e) => ({ label: displayLocationName(e.location, isEnglish), count: e.count })),
                'trendsTodayByMonitoredTitle',
                'location',
                strings,
                'trendsTodayNoMonitoredAlerts'
            )
        );
    }

    document
        .getElementById('tabsHost')
        .replaceWith(buildTabs(strings, (key) => (key === 'today' ? renderToday() : renderAllTime())));

    renderAllTime();
}

main();

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { normalizeOblastName, oblastDisplayName, normalizeRaionName, raionDisplayName } from '../liveMap/regionNameUtils.js';
import { transliterate } from '../liveMap/transliterate.js';
import { buildThreatsTab } from './threats.js';

const KYIV_RAW_NAME = 'м. Київ';

const TODAY_STATS_SOURCE_DISPLAY = {
    ukrainealarm: 'UkraineAlarm',
    'alerts.in.ua': 'alerts.in.ua',
};

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
    light: {
        UAV: '#e09112',
        'cruise missile': '#991b1b',
        'ballistic missile': '#7c3aed',
        'surface-to-air missile': '#0d9488',
        'surface-to-air and ballistic': '#5b8fb0',
        'guided bomb': '#dc2626',
        unknown: '#6b7280',
    },
    dark: {
        UAV: '#f5b13d',
        'cruise missile': '#e0605a',
        'ballistic missile': '#a78bfa',
        'surface-to-air missile': '#2dd4bf',
        'surface-to-air and ballistic': '#7fb2d6',
        'guided bomb': '#ff7a9a',
        unknown: '#9aa4b2',
    },
};
const FALLBACK_COLOR = '#94a3b8';
const HOURLY_COLOR = { light: '#4a7db8', dark: '#6f9fd6' };

function themeKey() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function categoryName(category, isEnglish) {
    if (isEnglish) return category;
    return CATEGORY_UK[category] || category;
}

function categoryColor(category) {
    return CATEGORY_COLOR[themeKey()][category] || FALLBACK_COLOR;
}

function formatNumber(n) {
    return Math.round(n).toLocaleString();
}

function displayOblastName(name, isEnglish) {
    if (!isEnglish || !name) return name;
    return oblastDisplayName(normalizeOblastName(name), true);
}

function displayLocationName(name, isEnglish) {
    if (!isEnglish || !name) return name;
    if (name === KYIV_RAW_NAME) return oblastDisplayName('Київ', true);
    if (/область$/u.test(name)) return oblastDisplayName(normalizeOblastName(name), true);
    if (/район$/u.test(name)) return raionDisplayName(normalizeRaionName(name), true);

    return transliterate(name.replace(/^м\.\s*/u, ''));
}

function formatPercent(numerator, denominator) {
    if (!denominator) return '-';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

function monthLabel(month, isEnglish) {
    const [year, m] = month.split('-');
    const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
    const name = date.toLocaleDateString(isEnglish ? 'en-US' : 'uk-UA', { month: 'short', timeZone: 'UTC' }).replace(/\.$/, '');
    return `${name} ${year.slice(2)}`;
}

function buildSummaryCard(stats, strings) {
    const card = document.createElement('section');
    card.className = 'card ui-card';
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
    card.className = 'card ui-card';
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

const CHART = { top: 12, bottom: 26, axisWidth: 46, barWidth: 16, gap: 6, pad: 8, padEnd: 28 };

function niceScale(maxValue, tickCount = 4) {
    const rawStep = Math.max(1, maxValue) / tickCount;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalized = rawStep / magnitude;
    const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
    const max = Math.ceil(maxValue / step) * step;
    const ticks = [];
    for (let value = 0; value <= max; value += step) ticks.push(value);
    return { max, ticks };
}

function compactNumber(value, isEnglish) {
    return new Intl.NumberFormat(isEnglish ? 'en-US' : 'uk-UA', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildChartFrame({ scale, plotHeight, plotWidth, isEnglish, scrollToEnd, draw }) {
    const totalHeight = CHART.top + plotHeight + CHART.bottom;
    const y = (value) => CHART.top + plotHeight - (value / scale.max) * plotHeight;
    const crisp = (value) => Math.round(value) + 0.5;

    const grid = scale.ticks
        .map((tick) => `<line class="chart-grid" x1="0" x2="${plotWidth}" y1="${crisp(y(tick))}" y2="${crisp(y(tick))}"/>`)
        .join('');
    const axisLabels = scale.ticks
        .map((tick) => `<text class="chart-label" x="${CHART.axisWidth - 8}" y="${y(tick) + 4}" text-anchor="end">${compactNumber(tick, isEnglish)}</text>`)
        .join('');

    const frame = document.createElement('div');
    frame.className = 'chart-frame';
    frame.innerHTML = `<svg class="chart-axis" width="${CHART.axisWidth}" height="${totalHeight}" viewBox="0 0 ${CHART.axisWidth} ${totalHeight}">${axisLabels}</svg><div class="chart-scroll"><svg width="${plotWidth}" height="${totalHeight}" viewBox="0 0 ${plotWidth} ${totalHeight}">${grid}${draw(y)}</svg></div>`;

    if (scrollToEnd) {
        requestAnimationFrame(() => {
            const scroller = frame.querySelector('.chart-scroll');
            scroller.scrollLeft = scroller.scrollWidth;
        });
    }
    return frame;
}

function buildMonthlyChart(stats, strings, isEnglish) {
    const card = document.createElement('section');
    card.className = 'card ui-card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsMonthlyTitle;
    card.appendChild(h2);

    const months = stats.monthly;
    const categories = stats.byCategory.map((c) => c.category);
    const scale = niceScale(Math.max(1, ...months.map((m) => m.launched)));
    const step = CHART.barWidth + CHART.gap;
    const plotWidth = CHART.pad + CHART.padEnd + months.length * step - CHART.gap;
    const plotHeight = 200;

    const frame = buildChartFrame({
        scale,
        plotHeight,
        plotWidth,
        isEnglish,
        scrollToEnd: true,
        draw: (y) => {
            const parts = [];
            months.forEach((entry, index) => {
                const x = CHART.pad + index * step;
                let cumulative = 0;
                const lines = [];

                categories.forEach((category) => {
                    const value = entry.categories[category] || 0;
                    if (!value) return;
                    const top = y(cumulative + value);
                    const bottom = y(cumulative);
                    parts.push(
                        `<rect class="chart-seg" x="${x}" y="${top.toFixed(1)}" width="${CHART.barWidth}" height="${(bottom - top).toFixed(1)}" fill="${categoryColor(category)}"/>`
                    );
                    cumulative += value;
                    lines.push(`${categoryName(category, isEnglish)}: ${formatNumber(value)}`);
                });

                const title = escapeHtml(`${monthLabel(entry.month, isEnglish)} - ${formatNumber(entry.launched)}\n${lines.join('\n')}`);
                parts.push(
                    `<rect class="chart-hit" x="${x - CHART.gap / 2}" y="${CHART.top}" width="${step}" height="${plotHeight}"><title>${title}</title></rect>`
                );

                if ((months.length - 1 - index) % 3 === 0) {
                    parts.push(
                        `<text class="chart-label" x="${x + CHART.barWidth / 2}" y="${CHART.top + plotHeight + 17}" text-anchor="middle">${monthLabel(entry.month, isEnglish)}</text>`
                    );
                }
            });
            return parts.join('');
        },
    });
    card.appendChild(frame);

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
    card.className = 'card ui-card';
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
    card.className = 'card ui-card';
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

const CLOCK = { size: 280, center: 140, inner: 54, outer: 104, tickOuter: 113, labelRadius: 125 };
let clockTimer = null;

function clockPoint(angle, radius) {
    const radians = (angle * Math.PI) / 180;
    return [CLOCK.center + radius * Math.sin(radians), CLOCK.center - radius * Math.cos(radians)];
}

function clockSector(startAngle, endAngle, innerRadius, outerRadius) {
    const [x1, y1] = clockPoint(startAngle, innerRadius);
    const [x2, y2] = clockPoint(startAngle, outerRadius);
    const [x3, y3] = clockPoint(endAngle, outerRadius);
    const [x4, y4] = clockPoint(endAngle, innerRadius);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${outerRadius} ${outerRadius} 0 0 1 ${x3.toFixed(2)} ${y3.toFixed(2)} L${x4.toFixed(2)} ${y4.toFixed(2)} A${innerRadius} ${innerRadius} 0 0 0 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

function kyivClock() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const value = (type) => Number(parts.find((part) => part.type === type).value);
    return { hour: value('hour'), minute: value('minute'), second: value('second') };
}

function buildDayClock(byHour, scaleMax, strings) {
    const wrap = document.createElement('div');
    wrap.className = 'day-clock';
    const color = HOURLY_COLOR[themeKey()];
    const { center } = CLOCK;
    const now = kyivClock();
    const sectors = [];

    byHour.forEach((count, hour) => {
        const start = hour * 15 + 0.8;
        const end = (hour + 1) * 15 - 0.8;
        const label = String(hour).padStart(2, '0');
        sectors.push(`<path class="clock-track" d="${clockSector(start, end, CLOCK.inner, CLOCK.outer)}"/>`);
        if (count) {
            const length = CLOCK.inner + (CLOCK.outer - CLOCK.inner) * Math.min(1, count / scaleMax);
            sectors.push(`<path class="clock-bar" d="${clockSector(start, end, CLOCK.inner, length)}" fill="${color}"/>`);
        }
        sectors.push(`<path class="clock-hit" d="${clockSector(start, end, CLOCK.inner, CLOCK.outer)}"><title>${label}:00 - ${formatNumber(count)}</title></path>`);
    });

    const ticks = [];
    for (let hour = 0; hour < 24; hour++) {
        const major = hour % 3 === 0;
        const [x1, y1] = clockPoint(hour * 15, CLOCK.outer + 3);
        const [x2, y2] = clockPoint(hour * 15, CLOCK.tickOuter + (major ? 3 : 0));
        ticks.push(`<line class="clock-tick${major ? ' major' : ''}" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`);
        if (major) {
            const [lx, ly] = clockPoint(hour * 15, CLOCK.labelRadius);
            ticks.push(`<text class="chart-label clock-label" x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" text-anchor="middle" dominant-baseline="central">${hour === 0 ? '00' : String(hour).padStart(2, '0')}</text>`);
        }
    }

    wrap.innerHTML = `<svg class="clock-svg" width="${CLOCK.size}" height="${CLOCK.size}" viewBox="0 0 ${CLOCK.size} ${CLOCK.size}" role="img" aria-label="${escapeHtml(strings.trendsClockTitle)}">
        <circle class="clock-ring" cx="${center}" cy="${center}" r="${CLOCK.outer + 3}"/>
        <circle class="clock-ring" cx="${center}" cy="${center}" r="${CLOCK.inner - 3}"/>
        ${sectors.join('')}
        <path class="clock-now" d="${clockSector(now.hour * 15 + 0.8, (now.hour + 1) * 15 - 0.8, CLOCK.inner, CLOCK.outer)}"/>
        ${ticks.join('')}
        <line class="clock-hand-minute" x1="${center}" y1="${center + 10}" x2="${center}" y2="${center - 84}"/>
        <line class="clock-hand-hour" x1="${center}" y1="${center + 8}" x2="${center}" y2="${center - 46}"/>
        <circle class="clock-pin" cx="${center}" cy="${center}" r="4.5"/>
    </svg>
    <div class="clock-time"></div>`;

    const hourHand = wrap.querySelector('.clock-hand-hour');
    const minuteHand = wrap.querySelector('.clock-hand-minute');
    const timeLabel = wrap.querySelector('.clock-time');

    const update = () => {
        const time = kyivClock();
        const hourAngle = ((time.hour + time.minute / 60) / 24) * 360;
        const minuteAngle = ((time.minute + time.second / 60) / 60) * 360;
        hourHand.setAttribute('transform', `rotate(${hourAngle.toFixed(2)} ${center} ${center})`);
        minuteHand.setAttribute('transform', `rotate(${minuteAngle.toFixed(2)} ${center} ${center})`);
        timeLabel.textContent = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
    };
    update();

    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(() => {
        if (!wrap.isConnected) {
            clearInterval(clockTimer);
            clockTimer = null;
            return;
        }
        update();
    }, 15000);

    return wrap;
}

function buildHourlyChart(byHour, strings, isEnglish) {
    const card = document.createElement('section');
    card.className = 'card ui-card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsTodayByHourTitle;
    card.appendChild(h2);

    const scale = niceScale(Math.max(1, ...byHour));
    const barWidth = 20;
    const gap = 8;
    const step = barWidth + gap;
    const plotWidth = CHART.pad * 2 + 24 * step - gap;
    const plotHeight = 130;

    const layout = document.createElement('div');
    layout.className = 'hourly-layout';
    layout.appendChild(
        buildChartFrame({
            scale,
            plotHeight,
            plotWidth,
            isEnglish,
            scrollToEnd: false,
            draw: (y) => {
                const parts = [];
                byHour.forEach((count, hour) => {
                    const x = CHART.pad + hour * step;
                    const label = String(hour).padStart(2, '0');
                    if (count) {
                        const top = y(count);
                        parts.push(
                            `<rect class="chart-seg" x="${x}" y="${top.toFixed(1)}" width="${barWidth}" height="${(y(0) - top).toFixed(1)}" fill="${HOURLY_COLOR[themeKey()]}"/>`
                        );
                    }
                    parts.push(
                        `<rect class="chart-hit" x="${x - gap / 2}" y="${CHART.top}" width="${step}" height="${plotHeight}"><title>${label}:00 - ${formatNumber(count)}</title></rect>`
                    );
                    if (hour % 3 === 0) {
                        parts.push(
                            `<text class="chart-label" x="${x + barWidth / 2}" y="${CHART.top + plotHeight + 17}" text-anchor="middle">${label}</text>`
                        );
                    }
                });
                return parts.join('');
            },
        })
    );
    layout.appendChild(buildDayClock(byHour, scale.max, strings));
    card.appendChild(layout);
    return card;
}

function buildCountTable(entries, titleKey, columnKey, strings, emptyKey) {
    const card = document.createElement('section');
    card.className = 'card ui-card';
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
    table.innerHTML = `<thead><tr><th>${strings[columnKey]}</th><th class="numeric">${strings.trendsTodayCountColumn}</th></tr></thead>`;
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

    const definitions = [
        ['allTime', strings.trendsTabAllTime],
        ['today', strings.trendsTabToday],
        ['threats', strings.trendsTabThreats],
    ];
    const buttons = definitions.map(([key, label], index) => {
        const button = document.createElement('button');
        button.className = index === 0 ? 'tab active' : 'tab';
        button.textContent = label;
        button.addEventListener('click', () => {
            buttons.forEach((other) => other.classList.toggle('active', other === button));
            onSelect(key);
        });
        bar.appendChild(button);
        return button;
    });
    return bar;
}

async function main() {
    const strings = await window.alertServerTrends.getStrings();
    const settings = await window.alertServerTrends.getSettings();
    const isEnglish = settings.language === 'English';

    document.title = strings.trendsWindowTitle;
    document.getElementById('trendsHeader').textContent = strings.trendsHeader;

    const content = document.getElementById('content');
    const rangeElement = document.getElementById('trendsRange');

    // Independent of each other - each source is fetched in its own try/catch so one failing to load
    // never takes the others (or the tab bar) down. All three requests start right away in parallel,
    // but only the tab on screen is awaited, so the first tab appears as soon as its own data is in.
    const weaponPromise = window.alertServerTrends.getWeaponStats().catch(() => null);
    const todayPromise = window.alertServerTrends.getTodayStats().catch(() => null);
    const threatsPromise = window.alertServerTrends.getThreatTrends().catch(() => null);

    let activeTab = 'allTime';
    let rangeText = '';

    function showMessage(text, id) {
        content.innerHTML = '';
        const p = document.createElement('p');
        if (id) p.id = id;
        p.textContent = text;
        content.appendChild(p);
    }

    async function renderAllTime() {
        showMessage(strings.trendsLoading, 'loadingText');
        const stats = await weaponPromise;
        if (activeTab !== 'allTime') return;

        if (stats) {
            rangeText = strings.trendsRangeLabel.replace('{from}', stats.dateRange.from).replace('{to}', stats.dateRange.to);
            if (stats.unpublished && stats.unpublished.rows > 0) {
                rangeText += ` ${strings.trendsUnpublishedNote.replace('{count}', stats.unpublished.rows)}`;
            }
            rangeElement.textContent = rangeText;
        }
        if (!stats) {
            showMessage(strings.trendsNoData, 'errorText');
            return;
        }
        content.innerHTML = '';
        content.appendChild(buildSummaryCard(stats, strings));
        content.appendChild(buildMonthlyChart(stats, strings, isEnglish));
        content.appendChild(buildCategoryCard(stats, strings, isEnglish));
        content.appendChild(buildModelsCard(stats, strings, isEnglish));
    }

    async function renderToday() {
        showMessage(strings.trendsLoading, 'loadingText');
        const todayStats = await todayPromise;
        if (activeTab !== 'today') return;

        if (!todayStats) {
            showMessage(strings.trendsNoData, 'errorText');
            return;
        }
        content.innerHTML = '';
        const notice = document.createElement('p');
        notice.className = 'muted-note';
        const statusText = todayStats.complete
            ? strings.trendsTodayDataCurrent
            : strings.trendsTodayWarmingUp.replace('{minutes}', todayStats.warmupEtaMinutes);
        const sourceName = TODAY_STATS_SOURCE_DISPLAY[todayStats.source];
        notice.textContent = sourceName
            ? `${statusText} ${strings.trendsTodaySourceLabel.replace('{source}', sourceName)}`
            : statusText;
        content.appendChild(notice);
        content.appendChild(buildTodayAlertsCard(todayStats.total, strings));
        content.appendChild(buildHourlyChart(todayStats.byHour, strings, isEnglish));
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

    async function renderThreats() {
        showMessage(strings.trendsLoading, 'loadingText');
        const threatTrends = await threatsPromise;
        if (activeTab !== 'threats') return;

        if (!threatTrends) {
            showMessage(strings.trendsNoData, 'errorText');
            return;
        }
        content.innerHTML = '';
        content.appendChild(buildThreatsTab(threatTrends, strings, isEnglish));
    }

    document
        .getElementById('tabsHost')
        .replaceWith(
            buildTabs(strings, (key) => {
                activeTab = key;
                rangeElement.textContent = key === 'allTime' ? rangeText : '';
                if (key === 'today') renderToday();
                else if (key === 'threats') renderThreats();
                else renderAllTime();
            })
        );

    renderAllTime();
}

main();

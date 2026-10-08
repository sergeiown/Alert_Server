// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { normalizeOblastName, oblastDisplayName } from '../liveMap/regionNameUtils.js';

const TYPE_ORDER = ['uav', 'fpv', 'uav_recon', 'missile', 'kab', 'mig31k', 'unknown'];
const TYPE_COLOR = {
    uav: '#f5a623',
    fpv: '#0d9488',
    uav_recon: '#5b8fb0',
    missile: '#991b1b',
    kab: '#dc2626',
    mig31k: '#7c3aed',
    unknown: '#6b7280',
};
const FALLBACK_COLOR = '#94a3b8';
const SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const KYIV_RAW_NAME = 'м. Київ';

function formatNumber(value) {
    return Math.round(value).toLocaleString();
}

function regionName(name, isEnglish) {
    if (!isEnglish || !name) return name;
    if (name === KYIV_RAW_NAME) return oblastDisplayName('Київ', true);
    return /область$/u.test(name) ? oblastDisplayName(normalizeOblastName(name), true) : name;
}

function typeName(kind, strings) {
    return strings[`trendsThreatType_${kind}`] || kind;
}

function typeColor(kind) {
    return TYPE_COLOR[kind] || FALLBACK_COLOR;
}

function sortedKinds(byType) {
    const known = TYPE_ORDER.filter((kind) => byType[kind]);
    const extra = Object.keys(byType).filter((kind) => !TYPE_ORDER.includes(kind));
    return [...known, ...extra];
}

function card(title) {
    const section = document.createElement('section');
    section.className = 'card';
    const heading = document.createElement('h2');
    heading.textContent = title;
    section.appendChild(heading);
    return section;
}

function note(text) {
    const paragraph = document.createElement('p');
    paragraph.className = 'muted-note';
    paragraph.textContent = text;
    return paragraph;
}

function legend(kinds, strings) {
    const row = document.createElement('div');
    row.className = 'threat-legend';
    kinds.forEach((kind) => {
        const item = document.createElement('span');
        item.innerHTML = `<span class="swatch" style="background:${typeColor(kind)}"></span>${typeName(kind, strings)}`;
        row.appendChild(item);
    });
    return row;
}

function stackedColumns(columns, { height, labelEvery, strings }) {
    const maxTotal = Math.max(1, ...columns.map((column) => column.total));
    const wrap = document.createElement('div');
    wrap.className = 'threat-columns';
    wrap.style.setProperty('--plot-height', `${height}px`);

    columns.forEach((column, index) => {
        const slot = document.createElement('div');
        slot.className = 'threat-column';
        const kinds = sortedKinds(column.byType);
        slot.title = `${column.title}: ${formatNumber(column.total)}${
            kinds.length ? ` (${kinds.map((kind) => `${typeName(kind, strings)} ${formatNumber(column.byType[kind])}`).join(', ')})` : ''
        }`;

        const bar = document.createElement('div');
        bar.className = 'threat-bar';
        bar.style.height = `${(column.total / maxTotal) * 100}%`;
        kinds.forEach((kind) => {
            const segment = document.createElement('div');
            segment.style.flex = String(column.byType[kind]);
            segment.style.background = typeColor(kind);
            bar.appendChild(segment);
        });
        slot.appendChild(bar);

        const label = document.createElement('div');
        label.className = 'threat-column-label';
        label.textContent = index % labelEvery === 0 ? column.label : '';
        slot.appendChild(label);
        wrap.appendChild(slot);
    });
    return wrap;
}

function horizontalBars(entries, labelOf, strings) {
    const maxCount = Math.max(1, ...entries.map((entry) => entry.count));
    const list = document.createElement('div');
    list.className = 'threat-hbars';
    entries.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'threat-hbar-row';

        const label = document.createElement('span');
        label.className = 'threat-hbar-label';
        label.textContent = labelOf(entry);

        const track = document.createElement('span');
        track.className = 'threat-hbar-track';
        const fill = document.createElement('span');
        fill.className = 'threat-hbar-fill';
        fill.style.width = `${(entry.count / maxCount) * 100}%`;
        sortedKinds(entry.byType || {}).forEach((kind) => {
            const segment = document.createElement('span');
            segment.style.flex = String(entry.byType[kind]);
            segment.style.background = typeColor(kind);
            segment.title = `${typeName(kind, strings)}: ${formatNumber(entry.byType[kind])}`;
            fill.appendChild(segment);
        });
        track.appendChild(fill);

        const value = document.createElement('span');
        value.className = 'threat-hbar-value';
        value.textContent = formatNumber(entry.count);

        row.append(label, track, value);
        list.appendChild(row);
    });
    return list;
}

function dayLabel(dateKey) {
    const [, month, day] = dateKey.split('-');
    return `${day}.${month}`;
}

function buildSummary(data, strings) {
    const section = card(strings.trendsThreatsTotalTitle.replace('{days}', data.days));
    const row = document.createElement('div');
    row.id = 'summaryRow';

    const tile = document.createElement('div');
    tile.className = 'stat-tile';
    tile.innerHTML = `<div class="value">${formatNumber(data.totals.threats)}</div><div class="label">${strings.trendsThreatsTotalLabel}</div>`;
    row.appendChild(tile);

    const perDayAverage = data.totals.threats / Math.max(1, data.days);
    const averageTile = document.createElement('div');
    averageTile.className = 'stat-tile';
    averageTile.innerHTML = `<div class="value">${formatNumber(perDayAverage)}</div><div class="label">${strings.trendsThreatsPerDayAverage}</div>`;
    row.appendChild(averageTile);

    sortedKinds(data.totals.byType)
        .slice(0, 4)
        .forEach((kind) => {
            const typeTile = document.createElement('div');
            typeTile.className = 'stat-tile';
            typeTile.innerHTML = `<div class="value" style="color:${typeColor(kind)}">${formatNumber(data.totals.byType[kind])}</div><div class="label">${typeName(kind, strings)}</div>`;
            row.appendChild(typeTile);
        });

    section.appendChild(row);
    section.appendChild(note(strings.trendsThreatsSourceNote));
    return section;
}

function buildPerDay(data, strings) {
    const section = card(strings.trendsThreatsPerDayTitle);
    const kinds = sortedKinds(data.totals.byType);
    section.appendChild(legend(kinds, strings));
    section.appendChild(
        stackedColumns(
            data.perDay.map((day) => ({ total: day.total, byType: day.byType, label: dayLabel(day.date), title: dayLabel(day.date) })),
            { height: 160, labelEvery: data.days > 45 ? 10 : 5, strings }
        )
    );
    return section;
}

function buildByHour(data, strings) {
    const section = card(strings.trendsThreatsByHourTitle);
    section.appendChild(legend(sortedKinds(data.totals.byType), strings));
    const columns = data.byHour.total.map((total, hour) => {
        const byType = {};
        Object.entries(data.byHour.byType).forEach(([kind, values]) => {
            if (values[hour]) byType[kind] = values[hour];
        });
        const label = String(hour).padStart(2, '0');
        return { total, byType, label, title: `${label}:00` };
    });
    section.appendChild(stackedColumns(columns, { height: 150, labelEvery: 3, strings }));
    return section;
}

function buildOrigins(data, strings, isEnglish) {
    const section = card(strings.trendsThreatsOriginsTitle);
    if (!data.origins.sampleSize) {
        section.appendChild(note(strings.trendsThreatsCollecting));
        return section;
    }
    const since = data.origins.since ? new Date(data.origins.since).toLocaleDateString(isEnglish ? 'en-US' : 'uk-UA') : '';
    section.appendChild(note(strings.trendsThreatsOriginsNote.replace('{count}', formatNumber(data.origins.sampleSize)).replace('{since}', since)));
    section.appendChild(horizontalBars(data.origins.regions, (entry) => regionName(entry.region, isEnglish), strings));

    const sectorsTitle = document.createElement('h3');
    sectorsTitle.textContent = strings.trendsThreatsSectorsTitle;
    section.appendChild(sectorsTitle);
    const sectors = SECTORS.map((sector) => data.origins.sectors.find((entry) => entry.sector === sector) || { sector, count: 0, byType: {} });
    section.appendChild(horizontalBars(sectors, (entry) => strings[`trendsThreatsSector_${entry.sector}`], strings));
    return section;
}

function buildRoutes(data, strings, isEnglish) {
    const section = card(strings.trendsThreatsRoutesTitle);
    if (!data.routes.length) {
        section.appendChild(note(strings.trendsThreatsCollecting));
        return section;
    }
    section.appendChild(note(strings.trendsThreatsRoutesNote));

    const table = document.createElement('table');
    table.innerHTML = `<thead><tr>
        <th>${strings.trendsThreatsRouteFrom}</th>
        <th>${strings.trendsThreatsRouteTo}</th>
        <th class="numeric">${strings.trendsTodayCountColumn}</th>
        <th class="numeric">${strings.trendsThreatsRouteMinutes}</th>
    </tr></thead>`;
    const body = document.createElement('tbody');
    data.routes.forEach((route) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${regionName(route.from, isEnglish)}</td><td>${regionName(route.to, isEnglish)}</td><td class="numeric">${formatNumber(route.count)}</td><td class="numeric">${route.medianMinutes}</td>`;
        body.appendChild(row);
    });
    table.appendChild(body);
    section.appendChild(table);
    return section;
}

function buildAlertLinks(data, strings, isEnglish) {
    const section = card(strings.trendsThreatsLinksTitle);
    const links = data.alertLinks;
    if (!links.waves) {
        section.appendChild(note(strings.trendsThreatsCollecting));
        return section;
    }

    const row = document.createElement('div');
    row.id = 'summaryRow';
    [
        { value: `${Math.round(links.share * 100)}%`, label: strings.trendsThreatsLinksShare },
        { value: links.medianLeadMinutes === null ? '-' : String(links.medianLeadMinutes), label: strings.trendsThreatsLinksLead },
        { value: formatNumber(links.waves), label: strings.trendsThreatsLinksWaves },
    ].forEach(({ value, label }) => {
        const tile = document.createElement('div');
        tile.className = 'stat-tile';
        tile.innerHTML = `<div class="value">${value}</div><div class="label">${label}</div>`;
        row.appendChild(tile);
    });
    section.appendChild(row);
    section.appendChild(note(strings.trendsThreatsLinksNote));

    if (links.byRegion.length) {
        const table = document.createElement('table');
        table.innerHTML = `<thead><tr>
            <th>${strings.trendsTodayOblastColumn}</th>
            <th class="numeric">${strings.trendsThreatsLinksWaves}</th>
            <th class="numeric">${strings.trendsThreatsLinksShare}</th>
            <th class="numeric">${strings.trendsThreatsLinksLead}</th>
        </tr></thead>`;
        const body = document.createElement('tbody');
        links.byRegion.forEach((entry) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${regionName(entry.region, isEnglish)}</td><td class="numeric">${formatNumber(entry.waves)}</td><td class="numeric">${Math.round(entry.share * 100)}%</td><td class="numeric">${entry.medianLeadMinutes === null ? '-' : entry.medianLeadMinutes}</td>`;
            body.appendChild(tr);
        });
        table.appendChild(body);
        section.appendChild(table);
    }
    return section;
}

export function buildThreatsTab(data, strings, isEnglish) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(buildSummary(data, strings));
    fragment.appendChild(buildPerDay(data, strings));
    fragment.appendChild(buildByHour(data, strings));
    fragment.appendChild(buildOrigins(data, strings, isEnglish));
    fragment.appendChild(buildRoutes(data, strings, isEnglish));
    fragment.appendChild(buildAlertLinks(data, strings, isEnglish));
    return fragment;
}

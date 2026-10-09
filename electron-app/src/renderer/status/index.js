// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { tileSvg } from '../hub/tileIcons.js';

const REFRESH_MS = 5000;
const VIEW_KEY = 'alertserver.statusView';

const summary = document.getElementById('summary');
const summaryTitle = document.getElementById('summaryTitle');
const summaryHint = document.getElementById('summaryHint');
const list = document.getElementById('list');
const tilesButton = document.getElementById('viewTiles');
const listButton = document.getElementById('viewList');

let strings = null;
let overview = [];
let viewMode = readViewMode();

function readViewMode() {
    try {
        return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'tiles';
    } catch (err) {
        return 'tiles';
    }
}

function saveViewMode(mode) {
    try {
        localStorage.setItem(VIEW_KEY, mode);
    } catch (err) {}
}

function toneOf(region) {
    if (region.state !== 'alert') return 'calm';
    if (region.alertLevel === 'red') return 'red';
    if (region.alertLevel === 'yellow') return 'yellow';
    return 'active';
}

function appendLines(container, lines) {
    lines.forEach((line, index) => {
        if (index > 0) container.appendChild(document.createTextNode('\n'));
        const span = document.createElement('span');
        span.textContent = line.text;
        if (line.level === 'red' || line.level === 'yellow') span.className = `threat level-${line.level}`;
        else if (index === 0 || /:$/.test(line.text)) span.className = 'lead';
        container.appendChild(span);
    });
}

function buildTile(region) {
    const tile = document.createElement('article');
    tile.className = `tile tone-${toneOf(region)}`;

    const head = document.createElement('div');
    head.className = 'tile-head';
    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = region.name;
    const chip = document.createElement('span');
    chip.className = 'tile-chip';
    chip.textContent = region.state === 'alert' ? strings.forecastChipActive : strings.hubStatusCalm;
    head.append(name, chip);

    const body = document.createElement('div');
    body.className = 'tile-body';
    appendLines(body, region.lines);

    tile.append(head, body);
    return tile;
}

function buildRow(region) {
    const row = document.createElement('article');
    row.className = `row tone-${toneOf(region)}`;

    const bar = document.createElement('span');
    bar.className = 'row-bar';
    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = region.name;
    const state = document.createElement('span');
    state.className = 'row-state';
    state.textContent = region.state === 'alert' ? strings.forecastChipActive : strings.hubStatusCalm;
    const detail = document.createElement('span');
    detail.className = 'row-detail';
    detail.textContent =
        region.state === 'alert'
            ? `${region.typeNames.join(', ').replace(/^./u, (c) => c.toUpperCase())} - ${strings.alertOngoingDuration}: ${region.ongoingText}`
            : region.nextEtaText
              ? `${strings.statusCalmNext} ${strings.forecastEtaLabel} ${region.nextEtaText}`
              : strings.statusListCalm;

    row.append(bar, name, state, detail);
    return row;
}

function syncToggle() {
    tilesButton.classList.toggle('active', viewMode === 'tiles');
    listButton.classList.toggle('active', viewMode === 'list');
    list.className = viewMode === 'tiles' ? 'tiles' : 'rows';
}

function render() {
    const alerting = overview.filter((region) => region.state === 'alert');

    summary.classList.toggle('alerting', alerting.length > 0);
    document.getElementById('summaryIcon').innerHTML = tileSvg('status');
    summaryTitle.textContent = alerting.length ? strings.hubStatusActive.replace('{count}', alerting.length) : strings.hubStatusCalm;
    summaryHint.textContent = !overview.length
        ? strings.statusNoRegions
        : alerting.length
          ? `${strings.activeInMonitored}: ${alerting.length}`
          : strings.trayPopupNoAlerts;

    syncToggle();
    if (!overview.length) {
        const note = document.createElement('p');
        note.className = 'empty-note';
        note.textContent = strings.statusNoRegions;
        list.replaceChildren(note);
        return;
    }
    list.replaceChildren(...overview.map(viewMode === 'tiles' ? buildTile : buildRow));
}

async function refresh() {
    try {
        overview = await window.alertServerStatus.getOverview();
    } catch (err) {
        return;
    }
    render();
}

async function main() {
    strings = await window.alertServerStatus.getStrings();
    document.title = strings.menuStatus;
    document.getElementById('openLiveMap').textContent = strings.menuLiveMap;
    document.getElementById('locationsTitle').textContent = strings.statusLocationsTitle;
    tilesButton.textContent = strings.statusViewTiles;
    listButton.textContent = strings.statusViewList;

    document.getElementById('openLiveMap').addEventListener('click', () => window.alertServerStatus.openLiveMap());
    tilesButton.addEventListener('click', () => {
        viewMode = 'tiles';
        saveViewMode(viewMode);
        render();
    });
    listButton.addEventListener('click', () => {
        viewMode = 'list';
        saveViewMode(viewMode);
        render();
    });

    window.alertServerStatus.onRefresh(refresh);
    await refresh();
    setInterval(refresh, REFRESH_MS);
}

main();

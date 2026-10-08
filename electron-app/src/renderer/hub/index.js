// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { TILES, tileSvg } from './tileIcons.js';

const hub = window.alertServerHub;

const SUMMARY_REFRESH_MS = 5000;

const home = document.getElementById('home');
const sectionTitle = document.getElementById('sectionTitle');
const backButton = document.getElementById('backButton');
const menuButton = document.getElementById('menuButton');
const updateButton = document.getElementById('updateButton');
const updateToast = document.getElementById('updateToast');
const maximizeGlyph = document.getElementById('maximizeGlyph');
const restoreGlyph = document.getElementById('restoreGlyph');
const maximizeButton = document.getElementById('maximizeButton');
const statusTile = document.querySelector('.status-tile');

let strings = null;
let currentView = 'home';

const TILE_CAPTION_KEYS = {
    status: 'menuStatus',
    liveMap: 'menuLiveMap',
    forecast: 'menuForecast',
    trends: 'menuTrends',
    settings: 'menuSettings',
    log: 'menuLog',
    about: 'menuAbout',
};

function renderTiles() {
    document.querySelectorAll('.tile').forEach((tile) => {
        const name = tile.dataset.view;
        const palette = TILES[name];
        tile.style.setProperty('--from', palette.from);
        tile.style.setProperty('--to', palette.to);
        tile.querySelector('.tile-icon').innerHTML = tileSvg(name);
        tile.querySelector('.tile-caption').textContent = strings[TILE_CAPTION_KEYS[name]];
        tile.addEventListener('click', () => hub.navigate(name));
    });
}

function sectionName(view) {
    if (view === 'home') return strings.hubMenu;
    return strings[TILE_CAPTION_KEYS[view]];
}

function applyState(state) {
    currentView = state.view;
    home.hidden = state.view !== 'home';
    sectionTitle.textContent = sectionName(state.view);
    document.title = `Alert Server - ${sectionName(state.view)}`;
    backButton.disabled = !state.canGoBack;
    menuButton.classList.toggle('active', state.view === 'home');
    maximizeGlyph.hidden = state.maximized;
    restoreGlyph.hidden = !state.maximized;
    maximizeButton.title = state.maximized ? strings.hubRestore : strings.hubMaximize;
    if (state.view === 'home') refreshSummary();
}

async function refreshSummary() {
    const summary = await hub.getSummary();
    const alerting = summary.activeCount > 0;
    statusTile.classList.toggle('alerting', alerting);
    document.getElementById('statusLine').textContent = alerting
        ? strings.hubStatusActive.replace('{count}', summary.activeCount)
        : strings.hubStatusCalm;
    document.getElementById('statusHint').textContent = alerting ? strings.hubStatusActiveHint : strings.hubStatusCalmHint;
}

let toastTimer = null;

function showToast(text) {
    updateToast.textContent = text;
    updateToast.hidden = false;
    sectionTitle.style.visibility = 'hidden';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        updateToast.hidden = true;
        sectionTitle.style.visibility = '';
    }, 7000);
}

async function checkForUpdates() {
    updateButton.disabled = true;
    showToast(strings.aboutUpdateChecking);
    const result = await hub.checkForUpdates();
    const messages = {
        available: strings.aboutUpdateFound.replace('{version}', result.version || ''),
        upToDate: strings.aboutUpdateUpToDate,
        busy: strings.aboutUpdateBusy,
        unavailable: strings.aboutUpdateUnavailable,
        error: strings.aboutUpdateError,
    };
    showToast(messages[result.status] || messages.error);
    updateButton.disabled = false;
}

async function main() {
    strings = await hub.getStrings();
    const settings = await hub.getSettings();

    document.getElementById('appIcon').src = await hub.getIcon();
    document.getElementById('menuLabel').textContent = strings.hubMenu;
    document.getElementById('backLabel').textContent = strings.hubBack;
    document.getElementById('updateLabel').textContent = strings.aboutCheckUpdates;
    document.getElementById('closeButton').title = strings.hubClose;
    document.getElementById('welcome').textContent = strings.hubWelcome;
    document.getElementById('showOnStartupLabel').textContent = strings.hubShowOnStartup;
    document.getElementById('minimizeButton').title = strings.hubMinimize;

    const startupInput = document.getElementById('showOnStartup');
    startupInput.checked = settings.showHubOnStartup;
    startupInput.addEventListener('change', () => hub.setSetting('showHubOnStartup', startupInput.checked));

    renderTiles();

    menuButton.addEventListener('click', () => hub.navigate('home'));
    backButton.addEventListener('click', () => hub.back());
    updateButton.addEventListener('click', checkForUpdates);
    document.getElementById('closeButton').addEventListener('click', () => hub.close());
    document.getElementById('minimizeButton').addEventListener('click', () => hub.minimize());
    maximizeButton.addEventListener('click', () => hub.toggleMaximize());

    hub.onState(applyState);
    applyState(await hub.getState());
    refreshSummary();
    setInterval(() => {
        if (currentView === 'home') refreshSummary();
    }, SUMMARY_REFRESH_MS);
}

main();

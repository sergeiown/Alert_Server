// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const list = document.getElementById('regionsList');

let strings = null;
let renderToken = 0;
let expandedUid = null;

const REGIONS_REFRESH_MS = 60000;

function addCopyButton(body, textToCopy) {
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.textContent = strings.forecastCopyButton;
    button.addEventListener('click', async () => {
        await window.alertServerForecast.copyToClipboard(textToCopy);
        const original = button.textContent;
        button.textContent = strings.forecastCopied;
        setTimeout(() => {
            button.textContent = original;
        }, 1500);
    });
    body.appendChild(button);
}

function sortRank({ result }) {
    if (result.status === 'active') return 0;
    if (result.status === 'ok' && typeof result.etaMs === 'number') return 1 + result.etaMs;
    return Infinity;
}

function summaryText(result) {
    if (result.status === 'active') return strings.forecastChipActive;
    if (result.status === 'ok' && result.etaText) return `${strings.forecastEtaLabel} ${result.etaText}`;
    return strings.forecastNoHistoryShort;
}

function applyExpansion() {
    list.querySelectorAll('.region-card[data-uid]').forEach((card) => {
        card.classList.toggle('expanded', card.dataset.uid === expandedUid);
    });
}

function buildCard(region, result, collapsible) {
    const card = document.createElement('div');
    card.dataset.uid = String(region.uid);

    const levelClass = result.alertLevel === 'red' ? ' level-red' : result.alertLevel === 'yellow' ? ' level-yellow' : '';
    if (result.status === 'active') card.className = `region-card active${levelClass}`;
    else if (result.status === 'ok') card.className = 'region-card';
    else card.className = 'region-card empty';
    if (collapsible) card.classList.add('collapsible');
    else card.classList.add('expanded');

    const header = document.createElement(collapsible ? 'button' : 'div');
    header.className = 'card-header';
    const h2 = document.createElement('h2');
    h2.textContent = region.name;
    header.appendChild(h2);
    if (collapsible) {
        const summary = document.createElement('span');
        summary.className = 'card-summary';
        summary.textContent = summaryText(result);
        header.appendChild(summary);
        const chevron = document.createElement('span');
        chevron.className = 'chevron';
        header.appendChild(chevron);
        header.addEventListener('click', () => {
            expandedUid = expandedUid === card.dataset.uid ? null : card.dataset.uid;
            applyExpansion();
        });
    }
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'card-body';

    if (result.status === 'active') {
        const note = document.createElement('p');
        note.className = 'forecast-note';
        note.textContent = strings.forecastWhileActiveNote;
        body.appendChild(note);
    }

    if (result.status === 'empty' || (result.status === 'active' && !result.forecastText)) {
        const pre = document.createElement('pre');
        pre.className = 'empty-text';
        pre.textContent = strings.forecastNoHistory;
        body.appendChild(pre);
    } else {
        const text = result.status === 'active' ? result.forecastText : result.text;
        const pre = document.createElement('pre');
        pre.textContent = text;
        body.appendChild(pre);
        addCopyButton(body, `${region.name}\n${text}`);
    }

    card.appendChild(body);
    return card;
}

async function renderRegionsList() {
    const token = ++renderToken;
    const isFirstRender = list.children.length === 0;
    if (isFirstRender) {
        const loading = document.createElement('p');
        loading.textContent = strings.forecastLoading;
        list.appendChild(loading);
    }

    const regions = await window.alertServerForecast.getRegions();
    if (token !== renderToken) return;

    if (!regions.length) {
        list.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = strings.forecastNoRegions;
        list.appendChild(p);
        return;
    }

    const entries = await Promise.all(
        regions.map(async (region) => {
            try {
                return { region, result: await window.alertServerForecast.getRegionForecast(region.uid) };
            } catch (err) {
                return { region, result: { status: 'empty' } };
            }
        })
    );
    if (token !== renderToken) return;

    entries.sort((a, b) => sortRank(a) - sortRank(b));

    const collapsible = entries.length > 1;
    if (!collapsible || !entries.some(({ region }) => String(region.uid) === expandedUid)) expandedUid = null;

    const fragment = document.createDocumentFragment();
    entries.forEach(({ region, result }) => fragment.appendChild(buildCard(region, result, collapsible)));

    list.innerHTML = '';
    list.appendChild(fragment);
    applyExpansion();
}

async function main() {
    strings = await window.alertServerForecast.getStrings();
    document.title = strings.forecastWindowTitle;
    document.getElementById('forecastHeader').textContent = strings.forecastHeader;
    document.getElementById('baselineCalibrationNote').textContent = strings.forecastBaselineCalibrationNote;

    await renderRegionsList();

    window.alertServerForecast.onRegionsChanged(() => {
        renderRegionsList();
    });

    setInterval(renderRegionsList, REGIONS_REFRESH_MS);
}

main();

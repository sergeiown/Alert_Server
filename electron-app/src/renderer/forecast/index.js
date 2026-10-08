// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const list = document.getElementById('regionsList');

let strings = null;
let renderToken = 0;

const REGIONS_REFRESH_MS = 60000;

function addCopyButton(card, pre, strings) {
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.textContent = strings.forecastCopyButton;
    button.addEventListener('click', async () => {
        await window.alertServerForecast.copyToClipboard(pre.textContent);
        const original = button.textContent;
        button.textContent = strings.forecastCopied;
        setTimeout(() => {
            button.textContent = original;
        }, 1500);
    });
    card.appendChild(button);
}

function sortRank({ result }) {
    if (result.status === 'active') return 0;
    if (result.status === 'ok' && typeof result.etaMs === 'number') return 1 + result.etaMs;
    return Infinity;
}

async function renderRegionsList() {
    const token = ++renderToken;
    const isFirstRender = list.children.length === 0;
    let loading = null;
    if (isFirstRender) {
        loading = document.createElement('p');
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

    const fragment = document.createDocumentFragment();

    entries.forEach(({ region, result }) => {
        const card = document.createElement('div');

        const h2 = document.createElement('h2');
        h2.textContent = region.name;
        card.appendChild(h2);

        const pre = document.createElement('pre');
        card.appendChild(pre);

        if (result.status === 'active') {
            const levelClass = result.alertLevel === 'red' ? ' level-red' : result.alertLevel === 'yellow' ? ' level-yellow' : '';
            card.className = `region-card active${levelClass}`;

            if (result.lines && result.lines.length) {

                result.lines.forEach((line, i) => {
                    if (i > 0) pre.appendChild(document.createTextNode('\n'));
                    if (line.level === 'red' || line.level === 'yellow') {
                        const span = document.createElement('span');
                        span.className = `threat-line level-${line.level}`;
                        span.textContent = line.text;
                        pre.appendChild(span);
                    } else {
                        pre.appendChild(document.createTextNode(line.text));
                    }
                });
            } else {
                pre.textContent = result.text || strings.forecastActiveAlert;
            }

            if (result.forecastText) {
                const note = document.createElement('p');
                note.className = 'forecast-note';
                note.textContent = strings.forecastWhileActiveNote;
                card.appendChild(note);

                const forecastPre = document.createElement('pre');
                forecastPre.textContent = result.forecastText;
                card.appendChild(forecastPre);
                addCopyButton(card, forecastPre, strings);
            }
        } else if (result.status === 'ok') {
            card.className = 'region-card';
            pre.textContent = result.text;
            addCopyButton(card, pre, strings);
        } else {
            card.className = 'region-card empty';
            pre.textContent = strings.forecastNoHistory;
        }

        fragment.appendChild(card);
    });

    list.innerHTML = '';
    list.appendChild(fragment);
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

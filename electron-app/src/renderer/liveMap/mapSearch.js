// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { OBLAST_BORDERS } from './oblastBorders.js';
import { RAION_BORDERS } from './raionBorders.js';
import { CITIES } from './cityLabels.js';
import { RAION_OBLAST } from './raionOblastMap.js';
import { OBLAST_EN_BY_UK } from './regionLabels.js';
import { RAION_EN_BY_UK } from './raionLabels.js';
import { oblastDisplayName, raionDisplayName } from './regionNameUtils.js';

const MAX_RESULTS = 8;
const KIND_ORDER = { oblast: 0, city: 1, raion: 2, kyivRaion: 3, place: 4 };
const DISTRICT_KINDS = new Set(['quarter', 'neighbourhood', 'suburb', 'macrohood']);
const PLACE_TYPE_LABELS = {
    uk: { city: 'місто', town: 'місто', village: 'село', hamlet: 'хутір', suburb: 'передмістя', quarter: 'район міста', neighbourhood: 'район міста', isolated_dwelling: 'садиба', farm: 'ферма', locality: 'населений пункт' },
    en: { city: 'city', town: 'town', village: 'village', hamlet: 'hamlet', suburb: 'suburb', quarter: 'city district', neighbourhood: 'city district', isolated_dwelling: 'dwelling', farm: 'farm', locality: 'locality' },
};

const SEARCH_ICON =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 L21 21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[’ʼ`']/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function buildNameEntries(data, isEnglish, curatedCityNames) {
    const entries = [];
    const labels = PLACE_TYPE_LABELS[isEnglish ? 'en' : 'uk'];
    const places = (data && data.places) || { oblasts: [], rows: [] };
    const oblastLabels = places.oblasts.map((name) => oblastDisplayName(name, isEnglish));
    places.rows.forEach(([uk, en, detail, lat, lng, oblast]) => {
        if (DISTRICT_KINDS.has(detail)) return;
        const key = normalize(uk);
        if ((detail === 'city' || detail === 'town') && curatedCityNames.has(key)) return;
        const extra = [labels[detail] || '', oblastLabels[oblast] || ''].filter(Boolean).join(', ');
        entries.push({ kind: 'place', key: uk, lat, lng, detail, label: isEnglish && en ? en : uk, extra, terms: [uk, en] });
    });
    return entries.map((entry) => ({ ...entry, normalized: entry.terms.map(normalize).filter(Boolean) }));
}

function buildEntries(isEnglish) {
    const entries = [];

    Object.keys(OBLAST_BORDERS).forEach((name) => {
        entries.push({
            kind: 'oblast',
            key: name,
            label: oblastDisplayName(name, isEnglish),
            extra: '',
            terms: [name, OBLAST_EN_BY_UK.get(name) || '', oblastDisplayName(name, false), oblastDisplayName(name, true)],
        });
    });

    CITIES.forEach((city) => {
        entries.push({
            kind: 'city',
            key: city.uk,
            lat: city.lat,
            lng: city.lng,
            label: isEnglish ? city.en : city.uk,
            extra: city.oblast === 'Київ' ? '' : oblastDisplayName(city.oblast, isEnglish),
            terms: [city.uk, city.en],
        });
    });

    Object.keys(RAION_BORDERS).forEach((name) => {
        const oblast = RAION_OBLAST[name];
        entries.push({
            kind: 'raion',
            key: name,
            label: raionDisplayName(name, isEnglish),
            extra: oblast ? oblastDisplayName(oblast, isEnglish) : '',
            terms: [name, RAION_EN_BY_UK.get(name) || '', raionDisplayName(name, false), raionDisplayName(name, true)],
        });
    });

    return entries.map((entry) => ({ ...entry, normalized: entry.terms.map(normalize).filter(Boolean) }));
}

function rank(entry, query) {
    let best = null;
    entry.normalized.forEach((term) => {
        const index = term.indexOf(query);
        if (index < 0) return;
        const score = (index === 0 ? 0 : 1) * 100 + term.length;
        if (best === null || score < best) best = score;
    });
    return best;
}

function search(entries, rawQuery) {
    const query = normalize(rawQuery);
    if (query.length < 2) return [];
    return entries
        .map((entry) => ({ entry, score: rank(entry, query) }))
        .filter((item) => item.score !== null)
        .sort((a, b) => a.score - b.score || KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind])
        .slice(0, MAX_RESULTS)
        .map((item) => item.entry);
}

function createSearchControl({ strings, isEnglish, onSelect, loadNames }) {
    const baseEntries = buildEntries(isEnglish);
    const curatedCityNames = new Set(baseEntries.filter((entry) => entry.kind === 'city').flatMap((entry) => entry.normalized));
    let entries = baseEntries;
    let namesRequested = false;

    return L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control map-search');
            const button = L.DomUtil.create('a', 'map-search-button', container);
            button.href = '#';
            button.title = strings.liveMapSearchTitle;
            button.setAttribute('role', 'button');
            button.setAttribute('aria-label', strings.liveMapSearchTitle);
            button.innerHTML = SEARCH_ICON;

            const panel = L.DomUtil.create('div', 'map-search-panel', container);
            panel.hidden = true;
            const input = L.DomUtil.create('input', 'map-search-input', panel);
            input.type = 'search';
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.placeholder = strings.liveMapSearchPlaceholder;
            input.setAttribute('aria-label', strings.liveMapSearchTitle);
            const list = L.DomUtil.create('ul', 'map-search-results', panel);
            list.setAttribute('role', 'listbox');

            let results = [];
            let active = -1;

            const close = () => {
                panel.hidden = true;
                input.value = '';
                list.replaceChildren();
                results = [];
                active = -1;
                container.classList.remove('map-search-open');
            };

            const choose = (entry) => {
                close();
                onSelect(entry);
            };

            const paintActive = () => {
                Array.from(list.children).forEach((item, index) => item.classList.toggle('active', index === active));
                const current = list.children[active];
                if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest' });
            };

            const render = () => {
                list.replaceChildren();
                if (normalize(input.value).length < 2) return;
                if (!results.length) {
                    const empty = L.DomUtil.create('li', 'map-search-empty', list);
                    empty.textContent = strings.liveMapSearchNoResults;
                    return;
                }
                results.forEach((entry, index) => {
                    const item = L.DomUtil.create('li', 'map-search-item', list);
                    item.setAttribute('role', 'option');
                    const name = L.DomUtil.create('span', 'map-search-name', item);
                    name.textContent = entry.label;
                    if (entry.extra) {
                        const extra = L.DomUtil.create('span', 'map-search-extra', item);
                        extra.textContent = entry.extra;
                    }
                    item.addEventListener('mousedown', (event) => {
                        event.preventDefault();
                        choose(entry);
                    });
                    item.addEventListener('mousemove', () => {
                        active = index;
                        paintActive();
                    });
                });
            };

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            button.addEventListener('click', (event) => {
                event.preventDefault();
                if (panel.hidden) {
                    if (!namesRequested && loadNames) {
                        namesRequested = true;
                        loadNames()
                            .then((data) => {
                                entries = baseEntries.concat(buildNameEntries(data, isEnglish, curatedCityNames));
                                if (!panel.hidden && normalize(input.value).length >= 2) input.dispatchEvent(new Event('input'));
                            })
                            .catch(() => {
                                namesRequested = false;
                            });
                    }
                    panel.hidden = false;
                    container.classList.add('map-search-open');
                    input.focus();
                } else {
                    close();
                }
            });

            input.addEventListener('input', () => {
                results = search(entries, input.value);
                active = results.length ? 0 : -1;
                render();
                paintActive();
            });

            input.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    close();
                    return;
                }
                if (!results.length) return;
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    active = (active + 1) % results.length;
                    paintActive();
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    active = (active - 1 + results.length) % results.length;
                    paintActive();
                } else if (event.key === 'Enter') {
                    event.preventDefault();
                    choose(results[Math.max(0, active)]);
                }
            });

            return container;
        },
    });
}

export { createSearchControl, search, buildEntries };

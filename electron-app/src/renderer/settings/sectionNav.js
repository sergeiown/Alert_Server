// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { tileSvg } from '../hub/tileIcons.js';

const STORE_KEY = 'alertServer.settingsLastTile';
const ORDER = ['regions', 'general', 'sound', 'notifications'];
const TITLE_KEYS = {
    regions: 'regionsHeader',
    general: 'settingsGroupGeneral',
    sound: 'settingsGroupSound',
    notifications: 'settingsGroupNotifications',
};

function readLast() {
    try {
        const value = localStorage.getItem(STORE_KEY);
        return ORDER.includes(value) ? value : ORDER[0];
    } catch (err) {
        return ORDER[0];
    }
}

function writeLast(name) {
    try {
        localStorage.setItem(STORE_KEY, name);
    } catch (err) {
        return;
    }
}

function setupSectionNav(strings) {
    const home = document.getElementById('settings-home');
    const section = document.getElementById('settings-section');
    const title = document.getElementById('sectionTitle');
    const panes = Array.from(document.querySelectorAll('.settings-pane'));
    const summary = document.getElementById('summary');
    const regionsHint = document.getElementById('regionsTileHint');
    const tiles = new Map(Array.from(document.querySelectorAll('.settings-tile')).map((tile) => [tile.dataset.section, tile]));
    let front = readLast();

    document.getElementById('sectionBackLabel').textContent = strings.settingsBackToTiles;
    document.getElementById('carouselHint').textContent = strings.carouselHint;

    function arrange() {
        const count = ORDER.length;
        const frontIndex = ORDER.indexOf(front);
        ORDER.forEach((name, index) => {
            const tile = tiles.get(name);
            const distance = (index - frontIndex + count) % count;
            const position = distance === count - 1 ? -1 : distance;
            tile.dataset.pos = String(position);
            tile.tabIndex = position === 0 ? 0 : -1;
        });
    }

    function rotate(step) {
        const count = ORDER.length;
        front = ORDER[(ORDER.indexOf(front) + step + count) % count];
        arrange();
    }

    function open(name) {
        front = name;
        writeLast(name);
        arrange();
        title.textContent = strings[TITLE_KEYS[name]];
        panes.forEach((pane) => {
            pane.hidden = pane.dataset.section !== name;
        });
        home.hidden = true;
        section.hidden = false;
        document.getElementById('sectionBody').scrollTop = 0;
        window.dispatchEvent(new Event('resize'));
    }

    function close() {
        section.hidden = true;
        home.hidden = false;
        tiles.get(front).focus({ preventScroll: true });
    }

    tiles.forEach((tile, name) => {
        tile.querySelector('.tile-icon').innerHTML = tileSvg(tile.dataset.icon);
        tile.querySelector('.tile-caption').textContent = strings[TITLE_KEYS[name]];
        tile.addEventListener('click', () => {
            if (tile.dataset.pos === '0') open(name);
            else {
                front = name;
                arrange();
            }
        });
    });

    document.getElementById('sectionBack').addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
        if (!section.hidden) {
            if (event.key === 'Escape') close();
            return;
        }
        if (event.key === 'ArrowRight') {
            rotate(1);
            event.preventDefault();
        } else if (event.key === 'ArrowLeft') {
            rotate(-1);
            event.preventDefault();
        } else if (event.key === 'Enter' && event.target === document.body) {
            open(front);
        }
    });

    const syncHint = () => {
        regionsHint.textContent = summary.textContent;
    };
    new MutationObserver(syncHint).observe(summary, { childList: true, characterData: true, subtree: true });
    syncHint();
    arrange();
}

export { setupSectionNav };

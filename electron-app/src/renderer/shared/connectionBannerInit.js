// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { initConnectionBanner } from './connectionBanner.js';

const WINDOWS = [
    { name: 'alertServerHub', mode: 'flow', mountSelector: '#home' },
    { name: 'alertServerLiveMap', mode: 'overlay' },
    { name: 'alertServerStatus', mode: 'fixed' },
    { name: 'alertServerForecast', mode: 'fixed' },
    { name: 'alertServerTrends', mode: 'fixed' },
    { name: 'alertServer', mode: 'fixed' },
    { name: 'alertServerLog', mode: 'fixed' },
    { name: 'alertServerAbout', mode: 'fixed' },
];

const found = WINDOWS.find((entry) => window[entry.name] && typeof window[entry.name].getConnectionState === 'function');

if (found) {
    const api = window[found.name];
    const mount = found.mountSelector ? document.querySelector(found.mountSelector) : null;
    api.getStrings().then((strings) => initConnectionBanner({ api, strings, mode: found.mode, mount }));
}

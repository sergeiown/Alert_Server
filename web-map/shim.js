// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

(function () {
    'use strict';

    const LANGUAGE_KEY = 'alertmap.language';
    const POLL_MS = 10000;
    const MAX_RECONNECT_MS = 60000;
    const ALLOWED_LINK_HOSTS = ['www.openstreetmap.org', 'neptun.in.ua', 'alerts.in.ua', 'deepstatemap.live', 'github.com', 'www.naturalearthdata.com', 'creativecommons.org'];

    function detectLanguage() {
        let stored = null;
        try {
            stored = localStorage.getItem(LANGUAGE_KEY);
        } catch (err) {}
        if (stored === 'English' || stored === 'Ukrainian') return stored;
        const browser = (navigator.language || 'uk').toLowerCase();
        return browser.indexOf('uk') === 0 || browser.indexOf('ru') === 0 ? 'Ukrainian' : 'English';
    }

    const THEME_KEY = 'alertmap.theme';
    const nativeMatchMedia = window.matchMedia.bind(window);

    function detectTheme() {
        let stored = null;
        try {
            stored = localStorage.getItem(THEME_KEY);
        } catch (err) {}
        return stored === 'light' || stored === 'dark' ? stored : 'auto';
    }

    const themePreference = detectTheme();
    if (themePreference !== 'auto') document.documentElement.setAttribute('data-theme', themePreference);

    function effectiveDark() {
        return themePreference === 'auto' ? nativeMatchMedia('(prefers-color-scheme: dark)').matches : themePreference === 'dark';
    }

    window.matchMedia = function (query) {
        if (/prefers-color-scheme:\s*dark/.test(query)) {
            return {
                matches: effectiveDark(),
                media: query,
                onchange: null,
                addEventListener () {},
                removeEventListener () {},
                addListener () {},
                removeListener () {},
            };
        }
        return nativeMatchMedia(query);
    };

    const language = detectLanguage();
    document.documentElement.lang = language === 'English' ? 'en' : 'uk';

    let state = null;
    let features = { threats: false, occupied: false };
    let threats = [];
    let occupied = { geojson: null, date: null };
    const alertTypes = {};
    const threatListeners = [];
    let socket = null;
    let reconnectAttempts = 0;
    let pollTimer = null;
    const statusListeners = [];
    const connection = { live: false, stale: true };

    function fetchJson(url) {
        return fetch(url, { cache: 'no-cache' }).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        });
    }

    function typeName(id) {
        if (!id) return null;
        if (language === 'English') return id;
        return alertTypes[id] || id;
    }

    function withNames(entry) {
        return Object.assign({}, entry, {
            alertTypeName: entry.alertType ? typeName(entry.alertType) : null,
            threats: (entry.threats || []).map((threat) => {
                return { level: threat.level, description: threat.alertType ? typeName(threat.alertType) : null };
            }),
        });
    }

    function notifyStatus() {
        statusListeners.forEach((listener) => {
            listener({ live: connection.live, stale: connection.stale || (state ? state.stale : true) });
        });
    }

    function applyState(next) {
        state = next;
        features = next.features || features;
        connection.stale = Boolean(next.stale);
        notifyStatus();
    }

    function applyThreats(payload) {
        threats = (payload && payload.threats) || [];
        threatListeners.forEach((listener) => {
            listener(threats);
        });
    }

    function refreshOccupied() {
        if (!features.occupied) return Promise.resolve();
        return fetchJson('/public/occupied')
            .then((geojson) => {
                occupied = { geojson, date: null };
            })
            .catch(() => {});
    }

    const languageCode = language === 'English' ? 'en' : 'uk';
    let firstPoll = true;

    function poll() {
        const query = `?l=${languageCode}${firstPoll ? '&s=1' : ''}`;
        firstPoll = false;
        return fetchJson(`/public/state${query}`)
            .then(applyState)
            .then(() => {
                if (features.threats) return fetchJson('/public/threats').then(applyThreats);
            })
            .catch(() => {
                connection.stale = true;
                notifyStatus();
            });
    }

    function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(poll, POLL_MS);
    }

    function stopPolling() {
        if (!pollTimer) return;
        clearInterval(pollTimer);
        pollTimer = null;
    }

    function connectSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        let ws;
        try {
            ws = new WebSocket(`${protocol}//${location.host}/public/ws?l=${languageCode}`);
        } catch (err) {
            scheduleReconnect();
            return;
        }
        socket = ws;

        ws.addEventListener('open', () => {
            reconnectAttempts = 0;
            connection.live = true;
            stopPolling();
            notifyStatus();
        });

        ws.addEventListener('message', (event) => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (err) {
                return;
            }
            if (message.type === 'state') applyState(message.data);
            else if (message.type === 'threats') applyThreats(message.data);
            else if (message.type === 'ping') {
                connection.stale = Boolean(message.stale);
                notifyStatus();
            }
        });

        ws.addEventListener('close', () => {
            if (socket !== ws) return;
            connection.live = false;
            notifyStatus();
            startPolling();
            scheduleReconnect();
        });

        ws.addEventListener('error', () => {});
    }

    function scheduleReconnect() {
        const delay = Math.min(3000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_MS);
        reconnectAttempts += 1;
        setTimeout(connectSocket, delay);
    }

    let mapApi = null;
    const mapReadyListeners = [];

    let strings = null;
    const ready = Promise.all([
        fetchJson(`i18n/${language === 'English' ? 'en' : 'uk'}.json`).then((data) => {
            strings = data;
        }),
        fetchJson('data/alertTypes.json')
            .then((list) => {
                list.forEach((entry) => {
                    alertTypes[entry.id] = entry.name;
                });
            })
            .catch(() => {}),
        poll(),
    ]).then(refreshOccupied);

    setInterval(refreshOccupied, 30 * 60 * 1000);
    connectSocket();
    startPolling();

    function openExternal(url) {
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:' || ALLOWED_LINK_HOSTS.indexOf(parsed.hostname) === -1) return Promise.resolve();
            window.open(parsed.href, '_blank', 'noopener,noreferrer');
        } catch (err) {}
        return Promise.resolve();
    }

    window.alertServerLiveMap = {
        kyivTilesUrl: new URL('tiles/kyiv.pmtiles', location.href).href,
        regionsRefreshMs: 5000,
        minZoom: 3,
        get threatIconScale() {
            return window.matchMedia('(max-width: 560px)').matches ? 0.75 : 1;
        },
        getStrings () {
            return ready.then(() => {
                return strings;
            });
        },
        getSettings () {
            return Promise.resolve({ language, alertSourceProvider: 'alerts.in.ua', theme: 'system' });
        },
        getBaseMapUrl () {
            return Promise.resolve(effectiveDark() ? 'basemap-dark.svg' : 'basemap-light.svg');
        },
        getActiveAlertCount () {
            return ready.then(() => {
                return state ? state.total : 0;
            });
        },
        getDailyPeaks () {
            return ready.then(() => {
                return state ? state.peaks : { alertPeak: 0, threatPeak: 0 };
            });
        },
        getActiveAlertSource () {
            return Promise.resolve('alerts.in.ua');
        },
        getAlertedRegions () {
            return ready.then(() => {
                const regions = state ? state.regions : { oblasts: [], raions: [], kyivRaions: [] };
                return {
                    oblasts: regions.oblasts.map(withNames),
                    raions: regions.raions.map(withNames),
                    kyivRaions: regions.kyivRaions || [],
                };
            });
        },
        getOccupiedTerritory () {
            return ready.then(() => {
                return occupied;
            });
        },
        getThreats () {
            return ready.then(() => {
                return threats;
            });
        },
        onThreatsUpdated (callback) {
            threatListeners.push(callback);
        },
        takeScreenshot () {
            return Promise.resolve(false);
        },
        openExternal,
        getTitleBarAccentColor () {
            return Promise.resolve(null);
        },
        onTitleBarAccentColorChanged () {},
        onForceKyivMode () {},
        onMapReady (api) {
            mapApi = api;
            mapReadyListeners.forEach((listener) => {
                listener(api);
            });
        },
        consumePendingKyivMode () {
            return Promise.resolve(location.hash === '#kyiv');
        },
    };

    window.alertMapWeb = {
        language,
        theme: themePreference,
        nativeMatchMedia,
        setTheme (next) {
            try {
                localStorage.setItem(THEME_KEY, next);
            } catch (err) {}
            location.reload();
        },
        setLanguage (next) {
            try {
                localStorage.setItem(LANGUAGE_KEY, next);
            } catch (err) {}
            location.reload();
        },
        ready,
        whenMapReady (listener) {
            if (mapApi) listener(mapApi);
            else mapReadyListeners.push(listener);
        },
        getFeatures () {
            return features;
        },
        onStatus (listener) {
            statusListeners.push(listener);
            listener({ live: connection.live, stale: connection.stale });
        },
    };
})();

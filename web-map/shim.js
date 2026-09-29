// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

(function () {
    'use strict';

    var LANGUAGE_KEY = 'alertmap.language';
    var POLL_MS = 10000;
    var MAX_RECONNECT_MS = 60000;
    var ALLOWED_LINK_HOSTS = ['neptun.in.ua', 'alerts.in.ua', 'deepstatemap.live', 'github.com', 'www.naturalearthdata.com', 'creativecommons.org'];

    function detectLanguage() {
        var stored = null;
        try {
            stored = localStorage.getItem(LANGUAGE_KEY);
        } catch (err) {}
        if (stored === 'English' || stored === 'Ukrainian') return stored;
        var browser = (navigator.language || 'uk').toLowerCase();
        return browser.indexOf('uk') === 0 || browser.indexOf('ru') === 0 ? 'Ukrainian' : 'English';
    }

    var THEME_KEY = 'alertmap.theme';
    var nativeMatchMedia = window.matchMedia.bind(window);

    function detectTheme() {
        var stored = null;
        try {
            stored = localStorage.getItem(THEME_KEY);
        } catch (err) {}
        return stored === 'light' || stored === 'dark' ? stored : 'auto';
    }

    var themePreference = detectTheme();
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
                addEventListener: function () {},
                removeEventListener: function () {},
                addListener: function () {},
                removeListener: function () {},
            };
        }
        return nativeMatchMedia(query);
    };

    var language = detectLanguage();
    document.documentElement.lang = language === 'English' ? 'en' : 'uk';

    var state = null;
    var features = { threats: false, occupied: false };
    var threats = [];
    var occupied = { geojson: null, date: null };
    var alertTypes = {};
    var threatListeners = [];
    var socket = null;
    var reconnectAttempts = 0;
    var pollTimer = null;
    var statusListeners = [];
    var connection = { live: false, stale: true };

    function fetchJson(url) {
        return fetch(url, { cache: 'no-cache' }).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
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
            threats: (entry.threats || []).map(function (threat) {
                return { level: threat.level, description: threat.alertType ? typeName(threat.alertType) : null };
            }),
        });
    }

    function notifyStatus() {
        statusListeners.forEach(function (listener) {
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
        threatListeners.forEach(function (listener) {
            listener(threats);
        });
    }

    function refreshOccupied() {
        if (!features.occupied) return Promise.resolve();
        return fetchJson('/public/occupied')
            .then(function (geojson) {
                occupied = { geojson: geojson, date: null };
            })
            .catch(function () {});
    }

    var languageCode = language === 'English' ? 'en' : 'uk';
    var firstPoll = true;

    function poll() {
        var query = '?l=' + languageCode + (firstPoll ? '&s=1' : '');
        firstPoll = false;
        return fetchJson('/public/state' + query)
            .then(applyState)
            .then(function () {
                if (features.threats) return fetchJson('/public/threats').then(applyThreats);
            })
            .catch(function () {
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
        var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        var ws;
        try {
            ws = new WebSocket(protocol + '//' + location.host + '/public/ws?l=' + languageCode);
        } catch (err) {
            scheduleReconnect();
            return;
        }
        socket = ws;

        ws.addEventListener('open', function () {
            reconnectAttempts = 0;
            connection.live = true;
            stopPolling();
            notifyStatus();
        });

        ws.addEventListener('message', function (event) {
            var message;
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

        ws.addEventListener('close', function () {
            if (socket !== ws) return;
            connection.live = false;
            notifyStatus();
            startPolling();
            scheduleReconnect();
        });

        ws.addEventListener('error', function () {});
    }

    function scheduleReconnect() {
        var delay = Math.min(3000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_MS);
        reconnectAttempts += 1;
        setTimeout(connectSocket, delay);
    }

    var mapApi = null;
    var mapReadyListeners = [];

    var strings = null;
    var ready = Promise.all([
        fetchJson('i18n/' + (language === 'English' ? 'en' : 'uk') + '.json').then(function (data) {
            strings = data;
        }),
        fetchJson('data/alertTypes.json')
            .then(function (list) {
                list.forEach(function (entry) {
                    alertTypes[entry.id] = entry.name;
                });
            })
            .catch(function () {}),
        poll(),
    ]).then(refreshOccupied);

    setInterval(refreshOccupied, 30 * 60 * 1000);
    connectSocket();
    startPolling();

    function openExternal(url) {
        try {
            var parsed = new URL(url);
            if (parsed.protocol !== 'https:' || ALLOWED_LINK_HOSTS.indexOf(parsed.hostname) === -1) return Promise.resolve();
            window.open(parsed.href, '_blank', 'noopener,noreferrer');
        } catch (err) {}
        return Promise.resolve();
    }

    window.alertServerLiveMap = {
        kyivBase: {
            imageryUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            labelsUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
            attribution: '<a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Imagery &copy; Esri, Maxar, Earthstar Geographics</a>',
        },
        regionsRefreshMs: 5000,
        minZoom: 3,
        get threatIconScale() {
            return window.matchMedia('(max-width: 560px)').matches ? 0.75 : 1;
        },
        getStrings: function () {
            return ready.then(function () {
                return strings;
            });
        },
        getSettings: function () {
            return Promise.resolve({ language: language, alertSourceProvider: 'alerts.in.ua', theme: 'system' });
        },
        getBaseMapUrl: function () {
            return Promise.resolve(effectiveDark() ? 'basemap-dark.svg' : 'basemap-light.svg');
        },
        getActiveAlertCount: function () {
            return ready.then(function () {
                return state ? state.total : 0;
            });
        },
        getDailyPeaks: function () {
            return ready.then(function () {
                return state ? state.peaks : { alertPeak: 0, threatPeak: 0 };
            });
        },
        getActiveAlertSource: function () {
            return Promise.resolve('alerts.in.ua');
        },
        getAlertedRegions: function () {
            return ready.then(function () {
                var regions = state ? state.regions : { oblasts: [], raions: [], kyivRaions: [] };
                return {
                    oblasts: regions.oblasts.map(withNames),
                    raions: regions.raions.map(withNames),
                    kyivRaions: regions.kyivRaions || [],
                };
            });
        },
        getOccupiedTerritory: function () {
            return ready.then(function () {
                return occupied;
            });
        },
        getThreats: function () {
            return ready.then(function () {
                return threats;
            });
        },
        onThreatsUpdated: function (callback) {
            threatListeners.push(callback);
        },
        takeScreenshot: function () {
            return Promise.resolve(false);
        },
        openExternal: openExternal,
        getTitleBarAccentColor: function () {
            return Promise.resolve(null);
        },
        onTitleBarAccentColorChanged: function () {},
        onForceKyivMode: function () {},
        onMapReady: function (api) {
            mapApi = api;
            mapReadyListeners.forEach(function (listener) {
                listener(api);
            });
        },
        consumePendingKyivMode: function () {
            return Promise.resolve(location.hash === '#kyiv');
        },
    };

    window.alertMapWeb = {
        language: language,
        theme: themePreference,
        nativeMatchMedia: nativeMatchMedia,
        setTheme: function (next) {
            try {
                localStorage.setItem(THEME_KEY, next);
            } catch (err) {}
            location.reload();
        },
        setLanguage: function (next) {
            try {
                localStorage.setItem(LANGUAGE_KEY, next);
            } catch (err) {}
            location.reload();
        },
        ready: ready,
        whenMapReady: function (listener) {
            if (mapApi) listener(mapApi);
            else mapReadyListeners.push(listener);
        },
        getFeatures: function () {
            return features;
        },
        onStatus: function (listener) {
            statusListeners.push(listener);
            listener({ live: connection.live, stale: connection.stale });
        },
    };
})();

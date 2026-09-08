// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { startNeptunLayer } from './neptun.js';
import { addRiversLayer } from './rivers.js';
import { addLabelsLayer } from './labelsLayer.js';
import { addRegionStatusLayer } from './regionStatus.js';
import { addOccupiedTerritoryLayer } from './occupiedTerritory.js';
import { startStatusBar } from './statusBar.js';
import { addScreenshotControl } from './screenshot.js';
import { KYIV_RAION_BORDERS } from './kyivRaionBorders.js';
import { applyTitleBarAccentColor } from './chromeTint.js';

const UKRAINE_BOUNDS = [
    [44.387017, 22.138577],
    [52.380834, 40.220623],
];

function computeKyivBounds() {
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;

    Object.values(KYIV_RAION_BORDERS).forEach((ring) => {
        ring.forEach(([lat, lng]) => {
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
        });
    });

    return [
        [minLat, minLng],
        [maxLat, maxLng],
    ];
}

const KYIV_BOUNDS = computeKyivBounds();

const MAP_MIN_ZOOM = 5;

const ALERT_SOURCE_DISPLAY = {
    ukrainealarm: { name: 'UkraineAlarm', url: 'https://api.ukrainealarm.com' },
    'alerts.in.ua': { name: 'alerts.in.ua', url: 'https://alerts.in.ua' },
    neptun: { name: 'Neptun', url: 'https://neptun.in.ua' },
};

const CenterControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-center-wrapper');
        const link = L.DomUtil.create('a', 'leaflet-control-center', container);
        link.href = '#';
        link.title = this.options.title;
        link.innerHTML =
            '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
        L.DomEvent.on(link, 'click', (event) => {
            L.DomEvent.preventDefault(event);
            this.options.onClick();
        });
        return container;
    },
});

const KyivToggleControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function () {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-kyiv-toggle-wrapper');
        const link = L.DomUtil.create('a', 'leaflet-control-kyiv-toggle', container);
        link.href = '#';
        this._link = link;
        this._setLabel(false);

        L.DomEvent.on(link, 'click', (event) => {
            L.DomEvent.preventDefault(event);
            this.options.onToggle();
        });
        return container;
    },
    _setLabel: function (active) {
        this._link.textContent = active ? this.options.offLabel : this.options.onLabel;
        this._link.title = active ? this.options.offTitle : this.options.onTitle;
    },
    setActive: function (active) {
        this._setLabel(active);
        this._link.classList.toggle('active', active);
    },
});

async function main() {
    const strings = await window.alertServerLiveMap.getStrings();
    const settings = await window.alertServerLiveMap.getSettings();
    const baseMapUrl = await window.alertServerLiveMap.getBaseMapUrl();

    const activeAlertSourceKey = (await window.alertServerLiveMap.getActiveAlertSource()) || settings.alertSourceProvider;
    const alertSourceDisplay = ALERT_SOURCE_DISPLAY[activeAlertSourceKey] || ALERT_SOURCE_DISPLAY['alerts.in.ua'];
    document.title = strings.appName;

    applyTitleBarAccentColor(await window.alertServerLiveMap.getTitleBarAccentColor());
    window.alertServerLiveMap.onTitleBarAccentColorChanged(applyTitleBarAccentColor);

    const map = L.map('map', {
        center: [48.4, 31.2],
        zoom: 6,
        minZoom: MAP_MIN_ZOOM,
        maxZoom: 12,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: true,

        renderer: L.svg({ padding: 1 }),
    });

    let resolveMapRevealed;
    const mapRevealedPromise = new Promise((resolve) => {
        resolveMapRevealed = resolve;
    });

    let kyivModeActive = false;

    function fitAndLockMinZoom() {
        map.setMinZoom(MAP_MIN_ZOOM);
        map.setMaxBounds(null);
        const bounds = kyivModeActive ? KYIV_BOUNDS : UKRAINE_BOUNDS;

        map.fitBounds(bounds);
        map.setMinZoom(map.getZoom());
        if (kyivModeActive) map.setMaxBounds(L.latLngBounds(KYIV_BOUNDS).pad(0.05));
    }

    map.on('popupopen', () => {
        if (kyivModeActive) map.setMaxBounds(null);
    });
    map.on('popupclose', () => {
        if (kyivModeActive) map.setMaxBounds(L.latLngBounds(KYIV_BOUNDS).pad(0.05));
    });

    const baseMapOverlay = L.imageOverlay(baseMapUrl, UKRAINE_BOUNDS).addTo(map);
    setOpacity(baseMapOverlay.getElement(), 0);

    const isDarkMap = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const ESRI_ATTRIBUTION_HTML = '<a href="#" id="esriAttribution">Esri</a>';
    const kyivImageryLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
            attribution: ESRI_ATTRIBUTION_HTML,
            maxZoom: 19,
        }
    );
    const kyivLabelsLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
            attribution: ESRI_ATTRIBUTION_HTML,
            maxZoom: 19,
        }
    );

    let riverLayerWasOn = true;
    let occupiedTerritoryLayerWasOn = true;

    const WORLD_RING = [
        [-85, -180],
        [-85, 180],
        [85, 180],
        [85, -180],
    ];
    const kyivMask = L.polygon([WORLD_RING, ...Object.values(KYIV_RAION_BORDERS)], {
        className: 'kyiv-mask-shape',
        stroke: false,

        fillColor: isDarkMap ? '#10151c' : '#aad3df',
        fillOpacity: 1,
        interactive: false,
    });

    const KYIV_SCENE_FADE_MS = 450;
    const TILE_LOAD_TIMEOUT_MS = 5000;
    let sceneToken = 0;

    function setOpacity(el, value) {
        if (!el) return;
        el.classList.add('kyiv-fade-layer');
        el.style.opacity = String(value);
    }

    function fadeIn(el) {
        if (!el) return;
        setOpacity(el, 0);
        void el.offsetWidth;
        setOpacity(el, 1);
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function elementOf(layer) {
        return typeof layer.getContainer === 'function' ? layer.getContainer() : layer.getElement();
    }

    function allTilesLoaded(layer) {
        const container = layer.getContainer();
        if (!container) return true;
        const tiles = container.querySelectorAll('.leaflet-tile');
        return [...tiles].every((tile) => tile.classList.contains('leaflet-tile-loaded'));
    }

    function waitForTilesLoaded(layer) {
        return new Promise((resolve) => {
            const start = Date.now();
            function check() {
                if (allTilesLoaded(layer) || Date.now() - start > TILE_LOAD_TIMEOUT_MS) {
                    resolve();
                    return;
                }
                setTimeout(check, 50);
            }
            check();
        });
    }

    function waitForImageLoaded(imgEl) {
        if (!imgEl || imgEl.complete) return Promise.resolve();
        return new Promise((resolve) => {
            imgEl.addEventListener('load', resolve, { once: true });
            imgEl.addEventListener('error', resolve, { once: true });
        });
    }

    function sceneLayersFor(active) {
        return active ? [kyivImageryLayer, kyivLabelsLayer, kyivMask] : [baseMapOverlay];
    }

    async function waitForSceneReady(active) {
        if (active) {
            await Promise.all([waitForTilesLoaded(kyivImageryLayer), waitForTilesLoaded(kyivLabelsLayer)]);
        } else {
            await waitForImageLoaded(baseMapOverlay.getElement());
        }
        await sleep(50);
    }

    async function transitionRefit(mutate) {
        const token = ++sceneToken;
        const active = kyivModeActive;
        const container = map.getContainer();

        container.classList.add('map-transitioning');
        sceneLayersFor(active).forEach((layer) => setOpacity(elementOf(layer), 0));
        await sleep(KYIV_SCENE_FADE_MS);
        if (token !== sceneToken) return;

        mutate();

        await waitForSceneReady(active);
        if (token !== sceneToken) return;

        container.classList.remove('map-transitioning');
        sceneLayersFor(active).forEach((layer) => fadeIn(elementOf(layer)));
    }

    async function swapScene(active) {
        const token = ++sceneToken;
        const container = map.getContainer();

        container.classList.add('map-transitioning');
        sceneLayersFor(!active).forEach((layer) => setOpacity(elementOf(layer), 0));
        await sleep(KYIV_SCENE_FADE_MS);
        if (token !== sceneToken) return;

        if (active) {
            map.removeLayer(baseMapOverlay);
            if (riverLayerWasOn) map.removeLayer(riverLayer);
            if (occupiedTerritoryLayerWasOn) map.removeLayer(occupiedTerritoryLayer);
            kyivImageryLayer.addTo(map);
            kyivLabelsLayer.addTo(map);
            bindAttributionLink('esriAttribution', 'https://www.esri.com/');

            kyivMask.addTo(map);
            kyivMask.bringToBack();
        } else {
            map.removeLayer(kyivImageryLayer);
            map.removeLayer(kyivLabelsLayer);
            map.removeLayer(kyivMask);
            baseMapOverlay.addTo(map);
            if (riverLayerWasOn) riverLayer.addTo(map);
            if (occupiedTerritoryLayerWasOn) occupiedTerritoryLayer.addTo(map);
        }

        regionStatusLayer.setKyivMode(active);
        labelsLayer.setKyivMode(active);
        fitAndLockMinZoom();

        await waitForSceneReady(active);
        if (token !== sceneToken) return;

        container.classList.remove('map-transitioning');
        sceneLayersFor(active).forEach((layer) => fadeIn(elementOf(layer)));
    }

    fitAndLockMinZoom();
    map.attributionControl.setPrefix(false);

    function bindAttributionLink(id, url) {
        document.getElementById(id)?.addEventListener('click', (event) => {
            event.preventDefault();
            window.alertServerLiveMap.openExternal(url);
        });
    }

    map.attributionControl.addAttribution(`<a href="#" id="appAttribution">${strings.appName}</a>`);
    map.attributionControl.addAttribution(
        `<a href="#" id="alertsAttribution">${strings.liveMapAlertsAttributionPrefix} ${alertSourceDisplay.name}</a>`
    );
    map.attributionControl.addAttribution(`<a href="#" id="neptunAttribution">${strings.liveMapNeptunAttribution}</a>`);

    const deepStateAttributionHtml = `<a href="#" id="deepStateAttribution">${strings.liveMapDeepStateAttribution}</a>`;
    map.attributionControl.addAttribution(deepStateAttributionHtml);

    [
        ['appAttribution', 'https://github.com/sergeiown/Alert_Server'],
        ['alertsAttribution', alertSourceDisplay.url],
        ['neptunAttribution', 'https://neptun.in.ua'],
        ['deepStateAttribution', 'https://deepstatemap.live/'],
    ].forEach(([id, url]) => bindAttributionLink(id, url));

    new CenterControl({ title: strings.liveMapCenterButtonTitle, onClick: fitAndLockMinZoom }).addTo(map);

    addScreenshotControl(map, strings);

    const fullScreenIconOptions = isDarkMap
        ? {
              enterFullScreenIcon: `data:image/svg+xml;base64,${btoa(
                  '<svg width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 6a1 1 0 011-1h2a1 1 0 000-2H6a3 3 0 00-3 3v2a1 1 0 002 0V6zM5 18a1 1 0 001 1h2a1 1 0 110 2H6a3 3 0 01-3-3v-2a1 1 0 112 0v2zM18 5a1 1 0 011 1v2a1 1 0 102 0V6a3 3 0 00-3-3h-2a1 1 0 100 2h2zM19 18a1 1 0 01-1 1h-2a1 1 0 100 2h2a3 3 0 003-3v-2a1 1 0 10-2 0v2z" fill="#fff"/></svg>'
              )}`,
              exitFullScreenIcon: `data:image/svg+xml;base64,${btoa(
                  '<svg width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4a1 1 0 00-2 0v2.5a.5.5 0 01-.5.5H4a1 1 0 000 2h2.5A2.5 2.5 0 009 6.5V4zM9 20a1 1 0 11-2 0v-2.5a.5.5 0 00-.5-.5H4a1 1 0 110-2h2.5A2.5 2.5 0 019 17.5V20zM16 3a1 1 0 00-1 1v2.5A2.5 2.5 0 0017.5 9H20a1 1 0 100-2h-2.5a.5.5 0 01-.5-.5V4a1 1 0 00-1-1zM15 20a1 1 0 102 0v-2.5a.5.5 0 01.5-.5H20a1 1 0 100-2h-2.5a2.5 2.5 0 00-2.5 2.5V20z" fill="#fff"/></svg>'
              )}`,
          }
        : {};

    L.control
        .fullScreenButton({
            title: strings.liveMapFullScreenTitle,
            enterFullScreenTitle: strings.liveMapEnterFullScreenTitle,
            exitFullScreenTitle: strings.liveMapExitFullScreenTitle,
            showNotification: false,
            ...fullScreenIconOptions,
            onFullScreenChange: () => {
                transitionRefit(() => {
                    map.invalidateSize();
                    fitAndLockMinZoom();
                });
            },
        })
        .addTo(map);

    function applyKyivMode(active) {
        kyivModeActive = active;
        kyivToggle.setActive(active);

        map.getContainer().classList.toggle('kyiv-mode-active', active);

        if (active) {
            riverLayerWasOn = map.hasLayer(riverLayer);
            occupiedTerritoryLayerWasOn = map.hasLayer(occupiedTerritoryLayer);
            map.attributionControl.removeAttribution(deepStateAttributionHtml);
        } else {
            map.attributionControl.addAttribution(deepStateAttributionHtml);
            bindAttributionLink('deepStateAttribution', 'https://deepstatemap.live/');
        }
        swapScene(active);
    }

    const kyivToggle = new KyivToggleControl({
        onLabel: strings.liveMapKyivButtonLabel,
        offLabel: strings.liveMapUkraineButtonLabel,
        onTitle: strings.liveMapKyivButtonTitle,
        offTitle: strings.liveMapUkraineButtonTitle,
        onToggle: () => applyKyivMode(!kyivModeActive),
    }).addTo(map);

    window.alertServerLiveMap.onForceKyivMode(() => {
        if (!kyivModeActive) applyKyivMode(true);
    });

    new ResizeObserver(() => {
        map.invalidateSize();
        fitAndLockMinZoom();
    }).observe(document.getElementById('map'));

    const statusBar = startStatusBar(strings, settings.language);

    const regionStatusLayer = addRegionStatusLayer(map, strings, settings.language);
    const occupiedTerritoryLayer = addOccupiedTerritoryLayer(map);
    const threatsLayer = startNeptunLayer(map, strings, settings.language, statusBar.setThreatCount, mapRevealedPromise);
    const riverLayer = addRiversLayer(map);
    const labelsLayer = addLabelsLayer(map, strings, settings.language);

    L.control
        .layers(null, {
            [strings.liveMapLayerAlertStatus]: regionStatusLayer,
            [strings.liveMapLayerOccupiedTerritory]: occupiedTerritoryLayer,
            [strings.liveMapLayerThreats]: threatsLayer,
            [strings.liveMapLayerRiver]: riverLayer,
            [strings.liveMapLayerLabels]: labelsLayer,
        })
        .addTo(map);

    await waitForSceneReady(kyivModeActive);
    fadeIn(baseMapOverlay.getElement());
    await sleep(KYIV_SCENE_FADE_MS);
    resolveMapRevealed();
}

main();

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

// Must match ukraine_default.svg's own mapsvg:geoViewBox attribute (west north east south),
// or the background image will no longer line up.
const UKRAINE_BOUNDS = [
    [44.387017, 22.138577],
    [52.380834, 40.220623],
];

// Derived from the district borders themselves (not a separately hand-kept pair of numbers) so it
// can never drift out of sync with what the "Kyiv" button is actually zooming to.
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

// Display name + external link per alertSourceManager.js chain key - kept here (not fetched from
// main) since these are just presentation details for the attribution line, same as neptunAttribution/
// deepStateAttribution's own static labels below.
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

// A two-state toggle, not a separate "zoom to Kyiv" one-shot action - while on, Kyiv stays
// front-and-center (including across a fullscreen toggle or window resize, both of which would
// otherwise silently snap back to the whole-country view); the label itself names what clicking it
// does NEXT, swapping between the two on/off labels rather than showing a separate pressed state.
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
    // Which source is genuinely serving live data right now (can differ from settings.
    // alertSourceProvider during an automatic failover) - falls back to the preferred setting on
    // the rare chance the source manager hasn't reported one yet.
    const activeAlertSourceKey = (await window.alertServerLiveMap.getActiveAlertSource()) || settings.alertSourceProvider;
    const alertSourceDisplay = ALERT_SOURCE_DISPLAY[activeAlertSourceKey] || ALERT_SOURCE_DISPLAY['alerts.in.ua'];
    document.title = strings.appName;

    const map = L.map('map', {
        center: [48.4, 31.2],
        zoom: 6,
        minZoom: MAP_MIN_ZOOM,
        maxZoom: 12,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: true,
        // The occupied-territory layer needs the SVG root to exist immediately (it injects a
        // <pattern> into its <defs>) - forcing the renderer here avoids Leaflet lazily creating
        // that SVG only once the first vector layer is added.
        renderer: L.svg(),
    });

    // While Kyiv mode is on, EVERY re-fit (the center button, a fullscreen toggle, a window
    // resize) targets Kyiv instead of the whole country - not just the one click that turned it
    // on - or leaving Kyiv mode on through any of those would silently snap back out to Ukraine.
    // Persisted in localStorage (survives a same-window page reload AND a real close of this
    // window - liveMapWindow.js destroys the whole BrowserWindow when it's closed, not just hides
    // it, so a real close+reopen gets a genuinely fresh renderer with empty sessionStorage; the
    // live map window's own default disk-backed partition keeps localStorage around regardless).
    // A theme change also reloads this window outright (see settingsIpc.js) to re-evaluate every
    // layer's baked-in light/dark colors, which would otherwise silently drop back to the Ukraine
    // view instead of staying in Kyiv mode until the user actually turns it off themselves.
    const KYIV_MODE_STORAGE_KEY = 'liveMapKyivModeActive';
    let kyivModeActive = false;
    try {
        kyivModeActive = localStorage.getItem(KYIV_MODE_STORAGE_KEY) === 'true';
    } catch {
        // Storage can throw in a locked-down/private context - falls back to off, same as a fresh
        // window would start anyway.
    }

    // fitBounds/flyToBounds both clamp to the CURRENT minZoom, so the floor is always lifted back
    // to the map's absolute minimum first - otherwise a stale floor from an earlier call (e.g. a
    // mid-animation fullscreen-exit size read) could block the correct, lower zoom the real final
    // size needs. The floor stays at the fitted zoom itself in Kyiv mode - together with maxBounds
    // below, that pins the view to Kyiv: no zooming out past it, no panning past its edges either.
    // `animate` is only true for a deliberate user action worth the fly (the Center button, toggling
    // Kyiv mode itself) - a plain fitBounds stays the default everywhere else (initial load, a
    // fullscreen toggle, a window resize), where an animated fly would just be an odd delay.
    // maxBounds is always cleared before the fit/fly and only reapplied once the camera has
    // actually arrived (in lockAfterMove, on 'moveend') - setting it beforehand while the current
    // view is still the whole-country one (well outside Kyiv's own bounds) makes Leaflet snap the
    // view to fit inside it immediately, which looked exactly like a broken/wrong zoom happening
    // before the real animated fly even got to run. Locking minZoom has the same reason to wait for
    // 'moveend' rather than fire immediately: doing it right away would clamp the zoom mid-flight to
    // whatever it happened to be at that instant.
    function fitAndLockMinZoom(animate) {
        map.setMinZoom(MAP_MIN_ZOOM);
        map.setMaxBounds(null);
        const bounds = kyivModeActive ? KYIV_BOUNDS : UKRAINE_BOUNDS;

        function lockAfterMove() {
            map.setMinZoom(map.getZoom());
            if (kyivModeActive) map.setMaxBounds(L.latLngBounds(KYIV_BOUNDS).pad(0.05));
        }

        if (animate) {
            map.once('moveend', lockAfterMove);
            // A plain flyToBounds swoops out to a much lower zoom mid-flight before coming back in
            // on any large enough zoom change (its default easing curve) - fine for a modest pan,
            // but between the whole-country view and Kyiv's own scale that swoop was wide enough to
            // look like the zoom had broken rather than like a deliberate camera move.
            // easeLinearity near 1 flattens that curve down to close to a straight pan+zoom.
            map.flyToBounds(bounds, { duration: 0.9, easeLinearity: 1 });
        } else {
            map.fitBounds(bounds);
            lockAfterMove();
        }
    }

    const baseMapOverlay = L.imageOverlay(baseMapUrl, UKRAINE_BOUNDS).addTo(map);

    const isDarkMap = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // A real satellite/street-level tile layer, shown ONLY in Kyiv mode - the app's own base map is
    // one flat-color abstract SVG of the whole country, fine at a national view but not something
    // that gets more detailed no matter how far in this zooms, so it reads as a blown-up blur at
    // Kyiv's own scale. Google's own satellite+hybrid tiles (real imagery, with roads/place labels
    // overlaid) - already carries real place names on its own, so Kyiv's own district name labels
    // (kyivRaionLabels.js) are skipped entirely in this mode rather than doubling up on it. Not an
    // officially published tile API (no key, but also no formal terms covering this exact endpoint
    // the way the Maps JavaScript API's billed access does) - fine for this app's actual scale, but
    // worth knowing if it ever needs revisiting.
    const kyivTileLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20,
    });

    // Kept so leaving Kyiv mode restores each to whatever state it was actually in before entering
    // it (a layer the user had already turned off via the layers control shouldn't reappear).
    let riverLayerWasOn = true;
    let occupiedTerritoryLayerWasOn = true;

    // maxBounds (set below) only stops PANNING past Kyiv's edges - it doesn't stop the tile layer
    // itself from rendering real streets for whatever's still visible in the margin around Kyiv's
    // own (non-rectangular) shape within the current viewport. This masks that margin instead: one
    // polygon whose outer ring is the whole world and whose holes are Kyiv's own 10 districts -
    // everywhere outside those holes paints over the tiles in the same color the map already uses
    // for "nothing here" (matches #map's own background), leaving only Kyiv's actual shape visible.
    const WORLD_RING = [
        [-85, -180],
        [-85, 180],
        [85, 180],
        [85, -180],
    ];
    const kyivMask = L.polygon([WORLD_RING, ...Object.values(KYIV_RAION_BORDERS)], {
        className: 'kyiv-mask-shape',
        stroke: false,
        // Same background #map itself already uses outside Ukraine's own shape in the normal view
        // (see index.css) - light or dark, matching whichever theme is active, not fixed to one.
        fillColor: isDarkMap ? '#10151c' : '#aad3df',
        fillOpacity: 1,
        interactive: false,
    });

    // Swaps the base map / satellite tiles / Kyiv mask on a mode switch by fading whatever's
    // currently shown fully OUT first, only THEN adding and fading the new scene IN - not a true
    // crossfade (both partially visible at once), which could show the old map flashing on top of
    // the new one for that instant depending on which Leaflet pane/DOM position each layer's
    // element happened to land in (baseMapOverlay and the Kyiv mask share the vector overlay pane;
    // the satellite tiles sit in the tile pane underneath it - not a fixed, guaranteed stacking
    // order between the two once both are visible with partial opacity at once). Fading to nothing
    // before anything new appears removes that ambiguity outright. `sceneToken` guards a rapid
    // re-toggle mid-fade: only the transition that's still current gets to swap the actual layers.
    const KYIV_SCENE_FADE_MS = 300;
    let sceneToken = 0;

    function setOpacity(el, value) {
        if (!el) return;
        el.classList.add('kyiv-fade-layer');
        el.style.opacity = String(value);
    }

    function fadeIn(el) {
        if (!el) return;
        setOpacity(el, 0);
        void el.offsetWidth; // Force a reflow so the browser registers 0 before animating to 1.
        setOpacity(el, 1);
    }

    function swapScene(active) {
        const token = ++sceneToken;

        if (active) {
            setOpacity(baseMapOverlay.getElement(), 0);
        } else {
            setOpacity(kyivTileLayer.getContainer(), 0);
            setOpacity(kyivMask.getElement(), 0);
        }

        setTimeout(() => {
            if (token !== sceneToken) return; // superseded by a later toggle mid-fade

            if (active) {
                map.removeLayer(baseMapOverlay);
                if (riverLayerWasOn) map.removeLayer(riverLayer);
                if (occupiedTerritoryLayerWasOn) map.removeLayer(occupiedTerritoryLayer);
                kyivTileLayer.addTo(map);
                // Added (and pushed behind everything else already in the shared vector-overlay
                // pane) BEFORE the district layers re-render just below - so their freshly
                // (re)drawn shapes land after the mask in the DOM and paint on top of it, not the
                // other way around.
                kyivMask.addTo(map);
                kyivMask.bringToBack();
                fadeIn(kyivTileLayer.getContainer());
                fadeIn(kyivMask.getElement());
            } else {
                map.removeLayer(kyivTileLayer);
                map.removeLayer(kyivMask);
                baseMapOverlay.addTo(map);
                if (riverLayerWasOn) riverLayer.addTo(map);
                if (occupiedTerritoryLayerWasOn) occupiedTerritoryLayer.addTo(map);
                fadeIn(baseMapOverlay.getElement());
            }
        }, KYIV_SCENE_FADE_MS);
    }

    fitAndLockMinZoom();
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(`<a href="#" id="appAttribution">${strings.appName}</a>`);
    map.attributionControl.addAttribution(
        `<a href="#" id="alertsAttribution">${strings.liveMapAlertsAttributionPrefix} ${alertSourceDisplay.name}</a>`
    );
    map.attributionControl.addAttribution(`<a href="#" id="neptunAttribution">${strings.liveMapNeptunAttribution}</a>`);
    map.attributionControl.addAttribution(`<a href="#" id="deepStateAttribution">${strings.liveMapDeepStateAttribution}</a>`);

    // Each addAttribution call rebuilds the whole control's innerHTML from scratch (Leaflet's own
    // _update()), tearing down any earlier of these anchors - listeners must be wired up only
    // once, after every addAttribution call is done.
    const attributionLinks = [
        ['appAttribution', 'https://github.com/sergeiown/Alert_Server'],
        ['alertsAttribution', alertSourceDisplay.url],
        ['neptunAttribution', 'https://neptun.in.ua'],
        ['deepStateAttribution', 'https://deepstatemap.live/'],
    ];
    attributionLinks.forEach(([id, url]) => {
        document.getElementById(id).addEventListener('click', (event) => {
            event.preventDefault();
            window.alertServerLiveMap.openExternal(url);
        });
    });

    new CenterControl({ title: strings.liveMapCenterButtonTitle, onClick: () => fitAndLockMinZoom(true) }).addTo(map);

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
                map.invalidateSize();
                fitAndLockMinZoom();
            },
        })
        .addTo(map);

    // Single entry point for entering/leaving Kyiv mode - used both by the toggle button itself and
    // by the startup restore below, so a reload (theme change) ends up in exactly the same state a
    // real click would have produced, not a partial/inconsistent one. `animate` defaults to true (a
    // real toggle click deserves the crossfade/fly) but the startup restore passes false - nothing
    // should visibly "switch" on window open, it should just already be in that state.
    function applyKyivMode(active, animate = true) {
        kyivModeActive = active;
        try {
            localStorage.setItem(KYIV_MODE_STORAGE_KEY, String(active));
        } catch {
            // Ignored - same reasoning as the read above.
        }
        kyivToggle.setActive(active);
        // Scopes the attribution font-size/color tweak (index.css) to Kyiv mode only - normal
        // (Ukraine) mode has no plain-text Google credit next to the other links to clash with, so
        // it should keep Leaflet's own default attribution styling untouched.
        map.getContainer().classList.toggle('kyiv-mode-active', active);

        if (active) {
            riverLayerWasOn = map.hasLayer(riverLayer);
            occupiedTerritoryLayerWasOn = map.hasLayer(occupiedTerritoryLayer);
        }
        swapScene(active);

        regionStatusLayer.setKyivMode(active);
        labelsLayer.setKyivMode(active);

        // maxBounds itself is handled inside fitAndLockMinZoom (cleared before the fly, reapplied
        // once it lands) - see the comment there for why the order matters.
        fitAndLockMinZoom(animate);
    }

    // Added last (not right after CenterControl) so it lands directly under the fullscreen button
    // in the topleft stack - Leaflet stacks same-corner controls in add order, each new one further
    // from the corner than the last.
    const kyivToggle = new KyivToggleControl({
        onLabel: strings.liveMapKyivButtonLabel,
        offLabel: strings.liveMapUkraineButtonLabel,
        onTitle: strings.liveMapKyivButtonTitle,
        offTitle: strings.liveMapUkraineButtonTitle,
        onToggle: () => applyKyivMode(!kyivModeActive),
    }).addTo(map);

    // Restores Kyiv mode right where it was before a same-window reload (see the sessionStorage
    // read above) - without this, a theme change while Kyiv mode was on would silently drop back
    // to the whole-country view, which is exactly the "turns off on its own" behavior this exists
    // to avoid.
    if (kyivModeActive) applyKyivMode(true, false);

    // The DOM "resize" event only fires reliably for viewport/zoom changes, not for every case a
    // BrowserWindow's content area changes size - a ResizeObserver reacts to any actual size change
    // regardless of cause.
    new ResizeObserver(() => {
        map.invalidateSize();
        fitAndLockMinZoom();
    }).observe(document.getElementById('map'));

    const statusBar = startStatusBar(strings, settings.language);

    const regionStatusLayer = addRegionStatusLayer(map, strings, settings.language);
    const occupiedTerritoryLayer = addOccupiedTerritoryLayer(map);
    const threatsLayer = startNeptunLayer(map, strings, settings.language, statusBar.setThreatCount);
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
}

main();

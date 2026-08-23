import { startNeptunLayer } from './neptun.js';
import { addRiversLayer } from './rivers.js';
import { addLabelsLayer } from './labelsLayer.js';
import { addRegionStatusLayer } from './regionStatus.js';
import { addOccupiedTerritoryLayer } from './occupiedTerritory.js';
import { startStatusBar } from './statusBar.js';

// Exact bounding box taken from ukraine_default.svg's own mapsvg:geoViewBox attribute
// (west north east south), so the background image lines up without distortion.
const UKRAINE_BOUNDS = [
    [44.387017, 22.138577],
    [52.380834, 40.220623],
];

// The map's own absolute zoom-out floor - never changed at runtime, unlike the map's actual
// minZoom (see fitAndLockMinZoom), which moves to track whatever fits the current window size.
const MAP_MIN_ZOOM = 5;

const CenterControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
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

async function main() {
    const strings = await window.alertServerLiveMap.getStrings();
    const settings = await window.alertServerLiveMap.getSettings();
    const baseMapUrl = await window.alertServerLiveMap.getBaseMapUrl();
    document.title = strings.appName;

    const map = L.map('map', {
        center: [48.4, 31.2],
        zoom: 6,
        minZoom: MAP_MIN_ZOOM,
        maxZoom: 12,
        // Finer zoom steps (a quarter-level per scroll/pinch tick, half a level per +/- click)
        // instead of Leaflet's default whole-level jumps, which felt too coarse for this map.
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        attributionControl: true,
        // Forces the SVG root to exist immediately, instead of Leaflet lazily creating it on the
        // first vector layer - the occupied-territory layer needs to inject a <pattern> into that
        // SVG's <defs> for its hatching, before it (or anything else) has added any shape to it.
        renderer: L.svg(),
    });

    // Zooming out is never allowed past whatever "fit the whole country" needs at the map's
    // current size - fitBounds finds that zoom, and this locks it in as the floor immediately
    // after, so there's no empty space around the country to zoom out into. Since a resize (or
    // fullscreen) needs a different zoom to fit the same bounds in a differently sized viewport,
    // this re-fits and re-locks every time the map's own size actually changes, not just once.
    // The floor is lifted back to the map's own absolute minimum first - fitBounds clamps its own
    // result to the CURRENT minZoom, so calling this again during a fullscreen exit transition
    // (which can briefly report a stale, mid-animation container size before settling) would
    // otherwise get stuck: a too-high floor from that stale read blocks the correct, lower zoom
    // the real final size needs, even once this runs again with the right measurement.
    function fitAndLockMinZoom() {
        map.setMinZoom(MAP_MIN_ZOOM);
        map.fitBounds(UKRAINE_BOUNDS);
        map.setMinZoom(map.getZoom());
    }

    L.imageOverlay(baseMapUrl, UKRAINE_BOUNDS).addTo(map);
    fitAndLockMinZoom();
    // Leaflet's own "Leaflet" credit (setPrefix) isn't required by its license, so it's dropped -
    // this app's own name takes that spot instead, ahead of the actual map data credits.
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(`<a href="#" id="appAttribution">${strings.appName}</a>`);
    map.attributionControl.addAttribution(`<a href="#" id="neptunAttribution">${strings.liveMapNeptunAttribution}</a>`);
    map.attributionControl.addAttribution(`<a href="#" id="deepStateAttribution">${strings.liveMapDeepStateAttribution}</a>`);

    // Each addAttribution call above rebuilds the whole control's innerHTML from scratch (Leaflet's
    // own _update()), which would tear down and replace any earlier of these anchors - so listeners
    // are wired up only once, after every addAttribution call is done, not right after each one.
    const attributionLinks = [
        ['appAttribution', 'https://github.com/sergeiown/Alert_Server'],
        ['neptunAttribution', 'https://neptun.in.ua'],
        ['deepStateAttribution', 'https://deepstatemap.live/'],
    ];
    attributionLinks.forEach(([id, url]) => {
        document.getElementById(id).addEventListener('click', (event) => {
            event.preventDefault();
            window.alertServerLiveMap.openExternal(url);
        });
    });

    // Map controls (zoom, center, fullscreen) stay on the left; the layer toggle list goes on
    // the right (Leaflet's control default) so the two groups never compete for the same corner.
    new CenterControl({ title: strings.liveMapCenterButtonTitle, onClick: fitAndLockMinZoom }).addTo(map);

    // The plugin's own default icons are hard-coded black-on-white - fine in light mode, but
    // inverting the whole button via CSS filter (the previous approach) turns its white
    // background near-black, a visibly different shade than every other button's actual dark-mode
    // background color. Swapping in a white-fill version of the same icon instead keeps the
    // button's own background-color the one thing controlling its color, matching the others.
    const isDarkMap = window.matchMedia('(prefers-color-scheme: dark)').matches;
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

    // Resizing the window itself (not just entering/exiting fullscreen) also needs Leaflet to
    // recompute its container size and rescale to fill it, in both directions. The DOM "resize"
    // event only fires reliably for viewport/zoom changes, not for every case a BrowserWindow's
    // content area changes size - a ResizeObserver on the map container itself reacts to any
    // actual size change regardless of what caused it.
    new ResizeObserver(() => {
        map.invalidateSize();
        fitAndLockMinZoom();
    }).observe(document.getElementById('map'));

    const regionStatusLayer = addRegionStatusLayer(map, strings, settings.language);
    const occupiedTerritoryLayer = addOccupiedTerritoryLayer(map);
    const threatsLayer = startNeptunLayer(map, strings, settings.language);
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

    startStatusBar(strings, settings.language);
}

main();

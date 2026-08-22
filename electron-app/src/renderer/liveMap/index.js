import { startNeptunLayer } from './neptun.js';
import { addRiversLayer } from './rivers.js';
import { addRegionLabelsLayer } from './regionLabels.js';

// Exact bounding box taken from ukraine_default.svg's own mapsvg:geoViewBox attribute
// (west north east south), so the background image lines up without distortion.
const UKRAINE_BOUNDS = [
    [44.387017, 22.138577],
    [52.380834, 40.220623],
];

const CenterControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const link = L.DomUtil.create('a', 'leaflet-control-center', container);
        link.href = '#';
        link.title = this.options.title;
        link.innerHTML =
            '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
        L.DomEvent.on(link, 'click', (event) => {
            L.DomEvent.preventDefault(event);
            map.fitBounds(this.options.bounds);
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
        minZoom: 5,
        maxZoom: 12,
        attributionControl: true,
    });

    L.imageOverlay(baseMapUrl, UKRAINE_BOUNDS).addTo(map);
    map.fitBounds(UKRAINE_BOUNDS);
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(`<a href="#" id="neptunAttribution">${strings.liveMapNeptunAttribution}</a>`);
    document.getElementById('neptunAttribution').addEventListener('click', (event) => {
        event.preventDefault();
        window.alertServerLiveMap.openExternal('https://neptun.in.ua');
    });

    // Map controls (zoom, center, fullscreen) stay on the left; the layer toggle list goes on
    // the right (Leaflet's control default) so the two groups never compete for the same corner.
    new CenterControl({ title: strings.liveMapCenterButtonTitle, bounds: UKRAINE_BOUNDS }).addTo(map);

    L.control
        .fullScreenButton({
            title: strings.liveMapFullScreenTitle,
            enterFullScreenTitle: strings.liveMapEnterFullScreenTitle,
            exitFullScreenTitle: strings.liveMapExitFullScreenTitle,
            showNotification: false,
            onFullScreenChange: () => {
                map.invalidateSize();
                map.fitBounds(UKRAINE_BOUNDS);
            },
        })
        .addTo(map);

    // Resizing the window itself (not just entering/exiting fullscreen) also needs Leaflet to
    // recompute its container size and rescale to fill it, in both directions.
    window.addEventListener('resize', () => {
        map.invalidateSize();
        map.fitBounds(UKRAINE_BOUNDS);
    });

    const threatsLayer = startNeptunLayer(map, strings);
    const riverLayer = addRiversLayer(map);
    const labelsLayer = addRegionLabelsLayer(map, settings.language);

    L.control
        .layers(null, {
            [strings.liveMapLayerThreats]: threatsLayer,
            [strings.liveMapLayerRiver]: riverLayer,
            [strings.liveMapLayerLabels]: labelsLayer,
        })
        .addTo(map);
}

main();

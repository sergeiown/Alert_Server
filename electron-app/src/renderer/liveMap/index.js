import { startNeptunLayer } from './neptun.js';

// Exact bounding box taken from ukraine_default.svg's own mapsvg:geoViewBox attribute
// (west north east south), so the background image lines up without distortion.
const UKRAINE_BOUNDS = [
    [44.387017, 22.138577],
    [52.380834, 40.220623],
];

async function main() {
    const strings = await window.alertServerLiveMap.getStrings();
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

    L.control
        .fullScreenButton({
            title: strings.liveMapFullScreenTitle,
            enterFullScreenTitle: strings.liveMapEnterFullScreenTitle,
            exitFullScreenTitle: strings.liveMapExitFullScreenTitle,
            showNotification: false,
        })
        .addTo(map);

    startNeptunLayer(map, strings);
}

main();

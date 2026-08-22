// Exact bounding box taken from ukraine_default.svg's own mapsvg:geoViewBox attribute
// (west north east south), so the background image lines up without distortion.
const UKRAINE_BOUNDS = [
    [44.387017, 22.138577],
    [52.380834, 40.220623],
];

async function main() {
    const strings = await window.alertServerLiveMap.getStrings();
    document.title = strings.appName;

    const map = L.map('map', {
        center: [48.4, 31.2],
        zoom: 6,
        minZoom: 5,
        maxZoom: 12,
        attributionControl: false,
    });

    L.imageOverlay('../../../resources/icons/ukraine_live_map.svg', UKRAINE_BOUNDS).addTo(map);
    map.fitBounds(UKRAINE_BOUNDS);

    L.control
        .fullScreenButton({
            title: strings.liveMapFullScreenTitle,
            enterFullScreenTitle: strings.liveMapEnterFullScreenTitle,
            exitFullScreenTitle: strings.liveMapExitFullScreenTitle,
            showNotification: false,
        })
        .addTo(map);
}

main();

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const TOAST_VISIBLE_MS = 2500;

// Which controls get hidden for the capture (the .screenshot-hide-controls class on #map, toggled
// below, is what actually hides them - see index.css) - only the interactive Leaflet controls
// (zoom, the center button, the fullscreen toggle, the layer picker, this button itself). The
// legend, attribution, status bar, threats, and every map layer stay, since those are the actual
// content someone screenshots the map for.
const ScreenshotControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-screenshot-wrapper');
        const link = L.DomUtil.create('a', 'leaflet-control-screenshot', container);
        link.href = '#';
        link.title = this.options.title;
        link.innerHTML =
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M9 7l1.2-2h3.6L15 7"/>' +
            '<rect x="3" y="7" width="18" height="12" rx="2"/>' +
            '<circle cx="12" cy="13" r="3.2"/>' +
            '</svg>';
        L.DomEvent.on(link, 'click', (event) => {
            L.DomEvent.preventDefault(event);
            this.options.onClick();
        });
        return container;
    },
});

function showToast(strings, success) {
    const toast = document.getElementById('screenshotToast');
    toast.textContent = success ? strings.liveMapScreenshotCopied : strings.liveMapScreenshotFailed;
    toast.classList.toggle('screenshot-toast-error', !success);
    toast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.add('hidden'), TOAST_VISIBLE_MS);
}

async function captureAndCopy(strings) {
    const mapEl = document.getElementById('map');
    mapEl.classList.add('screenshot-hide-controls');

    // Give the browser a frame to actually apply the visibility change before the main process
    // captures the window's current pixels - capturing in the same tick could still catch the
    // controls mid-repaint.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    let success = false;
    try {
        success = await window.alertServerLiveMap.takeScreenshot();
    } finally {
        mapEl.classList.remove('screenshot-hide-controls');
    }

    showToast(strings, success);
}

function addScreenshotControl(map, strings) {
    new ScreenshotControl({ title: strings.liveMapScreenshotButtonTitle, onClick: () => captureAndCopy(strings) }).addTo(map);
}

export { addScreenshotControl };

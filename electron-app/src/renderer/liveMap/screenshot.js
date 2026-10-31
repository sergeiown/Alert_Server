// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const TOAST_VISIBLE_MS = 3800;

const ScreenshotControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-screenshot-wrapper');
        const link = L.DomUtil.create('a', 'leaflet-control-screenshot', container);
        link.href = '#';
        link.title = this.options.title;
        link.innerHTML = '<svg viewBox="0 0 56 56" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M 47.61 21.40 C 48.85 21.40 49.51 20.72 49.51 19.48 L 49.51 13.73 C 49.51 8.91 47.07 6.49 42.15 6.49 L 36.43 6.49 C 35.19 6.49 34.51 7.17 34.51 8.37 C 34.51 9.58 35.19 10.26 36.43 10.26 L 42.10 10.26 C 44.40 10.26 45.74 11.51 45.74 13.94 L 45.74 19.48 C 45.74 20.72 46.42 21.40 47.61 21.40 Z M 8.38 21.40 C 9.60 21.40 10.25 20.72 10.25 19.48 L 10.25 13.94 C 10.25 11.51 11.57 10.26 13.91 10.26 L 19.58 10.26 C 20.80 10.26 21.48 9.58 21.48 8.37 C 21.48 7.17 20.80 6.49 19.58 6.49 L 13.84 6.49 C 8.96 6.49 6.48 8.91 6.48 13.73 L 6.48 19.48 C 6.48 20.72 7.16 21.40 8.38 21.40 Z M 17.82 37.38 L 37.65 37.38 C 39.20 37.38 40.32 36.30 40.32 34.80 L 40.32 22.90 C 40.32 21.40 39.20 20.32 37.65 20.32 L 34.09 20.32 C 33.50 20.32 33.20 20.16 32.71 19.57 L 32.21 18.96 C 31.67 18.28 31.02 17.98 30.22 17.98 L 25.30 17.98 C 24.46 17.98 23.80 18.28 23.26 18.96 L 22.77 19.57 C 22.28 20.16 21.99 20.32 21.46 20.32 L 17.82 20.32 C 16.28 20.32 15.20 21.40 15.20 22.90 L 15.20 34.80 C 15.20 36.30 16.28 37.38 17.82 37.38 Z M 27.76 33.94 C 24.64 33.94 22.11 31.38 22.11 28.26 C 22.11 25.10 24.64 22.57 27.76 22.57 C 30.92 22.57 33.43 25.10 33.43 28.26 C 33.43 31.38 30.92 33.94 27.76 33.94 Z M 27.76 32.27 C 29.99 32.27 31.79 30.49 31.79 28.26 C 31.79 25.99 29.99 24.21 27.76 24.21 C 25.53 24.21 23.75 25.99 23.75 28.26 C 23.75 30.49 25.53 32.27 27.76 32.27 Z M 13.84 49.50 L 19.58 49.50 C 20.80 49.50 21.48 48.82 21.48 47.62 C 21.48 46.41 20.80 45.73 19.58 45.73 L 13.91 45.73 C 11.57 45.73 10.25 44.48 10.25 42.05 L 10.25 36.51 C 10.25 35.27 9.57 34.59 8.38 34.59 C 7.14 34.59 6.48 35.27 6.48 36.51 L 6.48 42.23 C 6.48 47.08 8.96 49.50 13.84 49.50 Z M 36.43 49.50 L 42.15 49.50 C 47.07 49.50 49.51 47.06 49.51 42.23 L 49.51 36.51 C 49.51 35.27 48.83 34.59 47.61 34.59 C 46.39 34.59 45.74 35.27 45.74 36.51 L 45.74 42.05 C 45.74 44.48 44.40 45.73 42.10 45.73 L 36.43 45.73 C 35.19 45.73 34.51 46.41 34.51 47.62 C 34.51 48.82 35.19 49.50 36.43 49.50 Z"/></svg>';
        L.DomEvent.on(link, 'click', (event) => {
            L.DomEvent.preventDefault(event);
            this.options.onClick();
        });
        return container;
    },
});

function showToast(strings, success, thumbnail) {
    const toast = document.getElementById('screenshotToast');
    toast.textContent = '';
    if (success && thumbnail) {
        const image = document.createElement('img');
        image.className = 'screenshot-toast-thumb';
        image.alt = '';
        image.src = thumbnail;
        toast.appendChild(image);
    }
    const label = document.createElement('span');
    label.className = 'screenshot-toast-text';
    label.textContent = success ? strings.liveMapScreenshotCopied : strings.liveMapScreenshotFailed;
    toast.appendChild(label);
    toast.classList.toggle('screenshot-toast-error', !success);
    toast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.add('hidden'), TOAST_VISIBLE_MS);
}

async function captureAndCopy(strings) {
    const mapEl = document.getElementById('map');
    mapEl.classList.add('screenshot-hide-controls');

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    let result = null;
    try {
        result = await window.alertServerLiveMap.takeScreenshot();
    } finally {
        mapEl.classList.remove('screenshot-hide-controls');
    }

    showToast(strings, Boolean(result), result && result.thumbnail);
}

function addScreenshotControl(map, strings) {
    new ScreenshotControl({ title: strings.liveMapScreenshotButtonTitle, onClick: () => captureAndCopy(strings) }).addTo(map);
}

export { addScreenshotControl };

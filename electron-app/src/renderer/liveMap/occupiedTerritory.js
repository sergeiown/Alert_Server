// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const REFRESH_MS = 6 * 60 * 60 * 1000;
const PATTERN_ID = 'occupied-territory-hatch';

function ensureHatchPattern(map, color) {
    const svg = map.getPane('overlayPane').querySelector('svg');
    if (!svg || svg.querySelector(`#${PATTERN_ID}`)) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', PATTERN_ID);
    pattern.setAttribute('width', '6');
    pattern.setAttribute('height', '6');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('patternTransform', 'rotate(45)');

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '0');
    line.setAttribute('x2', '0');
    line.setAttribute('y2', '6');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '2');

    pattern.appendChild(line);
    defs.appendChild(pattern);
    svg.insertBefore(defs, svg.firstChild);
}

function addOccupiedTerritoryLayer(map) {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const color = isDark ? '#9a9a9a' : '#5a5a5a';
    ensureHatchPattern(map, color);

    const layer = L.layerGroup();
    let currentGeoJsonLayer = null;

    async function refresh() {
        const { geojson } = await window.alertServerLiveMap.getOccupiedTerritory();
        if (!geojson) return;

        if (currentGeoJsonLayer) layer.removeLayer(currentGeoJsonLayer);
        currentGeoJsonLayer = L.geoJSON(geojson, {
            style: {
                className: 'occupied-territory-shape',
                color,
                weight: 1.5,
                opacity: 0.8,
                dashArray: '6 4',
                fillColor: `url(#${PATTERN_ID})`,
                fillOpacity: 0.6,
            },
            interactive: false,
        }).addTo(layer);
    }

    refresh();
    setInterval(refresh, REFRESH_MS);

    return layer.addTo(map);
}

export { addOccupiedTerritoryLayer };

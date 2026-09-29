// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { KYIV_RAION_BORDERS } from './kyivRaionBorders.js';
import { transliterate } from './transliterate.js';

function ringCentroid(ring) {
    let area = 0;
    let lat = 0;
    let lng = 0;

    for (let i = 0; i < ring.length; i++) {
        const [lat1, lng1] = ring[i];
        const [lat2, lng2] = ring[(i + 1) % ring.length];
        const cross = lng1 * lat2 - lng2 * lat1;
        area += cross;
        lng += (lng1 + lng2) * cross;
        lat += (lat1 + lat2) * cross;
    }

    if (!area) return ring[0];
    return [lat / (3 * area), lng / (3 * area)];
}

function createKyivRaionLabels(isEnglish) {
    const items = Object.entries(KYIV_RAION_BORDERS).map(([name, ring]) => ({
        latlng: L.latLng(ringCentroid(ring)),
        text: isEnglish ? `${transliterate(name)} District` : `${name} район`,
    }));

    const RaionLabelsLayer = L.Layer.extend({
        onAdd(map) {
            this._map = map;
            const pane = map.getPane('kyivRaionLabels') || map.createPane('kyivRaionLabels');
            pane.style.zIndex = 450;
            pane.style.pointerEvents = 'none';

            this._container = L.DomUtil.create('div', 'kyiv-raion-labels', pane);
            this._inner = L.DomUtil.create('div', '', this._container);
            this._elements = items.map((item) => {
                const el = L.DomUtil.create('span', 'kyiv-raion-label', this._inner);
                el.textContent = item.text;
                return el;
            });

            map.on('zoomstart', this._hide, this);
            map.on('zoomend viewreset resize moveend', this._place, this);
            this._place();
        },

        onRemove(map) {
            map.off('zoomstart', this._hide, this);
            map.off('zoomend viewreset resize moveend', this._place, this);
            L.DomUtil.remove(this._container);
        },

        getContainer() {
            return this._container;
        },

        _hide() {
            this._inner.style.visibility = 'hidden';
        },

        _place() {
            items.forEach((item, index) => L.DomUtil.setPosition(this._elements[index], this._map.latLngToLayerPoint(item.latlng)));
            this._inner.style.visibility = '';
        },
    });

    return new RaionLabelsLayer();
}

export { createKyivRaionLabels };

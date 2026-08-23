// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { buildOblastGroup } from './regionLabels.js';
import { buildRaionGroup } from './raionLabels.js';
import { buildRaionBordersGroup } from './raionBorders.js';
import { buildCityGroup, CITIES } from './cityLabels.js';
import { OBLAST_MIN_ZOOM, RAION_MIN_ZOOM } from './zoomTiers.js';

const LabelsLayer = L.LayerGroup.extend({
    initialize: function (strings, language) {
        L.LayerGroup.prototype.initialize.call(this);
        this._language = language;
        this._oblastGroup = buildOblastGroup(language);
        this._raionGroup = L.layerGroup([
            buildRaionBordersGroup(),
            buildRaionGroup(language, CITIES),
            buildCityGroup(strings, language),
        ]);
        this._active = null;
    },

    onAdd: function (map) {
        this._map = map;
        map.on('zoomend', this._sync, this);
        this._sync();
    },

    onRemove: function (map) {
        map.off('zoomend', this._sync, this);
        if (this._active) map.removeLayer(this._active);
        this._active = null;
    },

    _sync: function () {
        const zoom = this._map.getZoom();
        const next = zoom < OBLAST_MIN_ZOOM ? null : zoom < RAION_MIN_ZOOM ? this._oblastGroup : this._raionGroup;

        if (next === this._active) return;
        if (this._active) this._map.removeLayer(this._active);
        this._active = next;
        if (this._active) this._active.addTo(this._map);
    },
});

function addLabelsLayer(map, strings, language) {
    return new LabelsLayer(strings, language).addTo(map);
}

export { addLabelsLayer };

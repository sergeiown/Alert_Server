import { buildOblastGroup } from './regionLabels.js';
import { buildRaionGroup } from './raionLabels.js';
import { buildRaionBordersGroup } from './raionBorders.js';

// The default/base view (the whole country fit to a typical window, around zoom 6) must always
// show oblast names, so this floors at the map's own minZoom - there's no lower tier to drop to.
// At RAION_MIN_ZOOM and above there's enough screen space per oblast that oblast names would just
// repeat the obvious, so raion (district) names - with their own light border lines, since at that
// scale the oblast borders alone don't say where one raion ends and the next begins - take over.
const OBLAST_MIN_ZOOM = 5;
const RAION_MIN_ZOOM = 9;

// A single Leaflet layer (so the layer-control checkbox has one master toggle) that swaps its
// visible content - nothing, oblast labels, or raion labels - as the user zooms, instead of
// showing every label at every scale.
const LabelsLayer = L.LayerGroup.extend({
    initialize: function (language) {
        L.LayerGroup.prototype.initialize.call(this);
        this._language = language;
        this._oblastGroup = buildOblastGroup(language);
        this._raionGroup = L.layerGroup([buildRaionBordersGroup(), buildRaionGroup(language)]);
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

function addLabelsLayer(map, language) {
    return new LabelsLayer(language).addTo(map);
}

export { addLabelsLayer };

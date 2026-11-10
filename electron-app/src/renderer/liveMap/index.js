// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { startNeptunLayer } from './neptun.js';
import { addRiversLayer } from './rivers.js';
import { addLabelsLayer } from './labelsLayer.js';
import { addRegionStatusLayer } from './regionStatus.js';
import { addOccupiedTerritoryLayer } from './occupiedTerritory.js';
import { ready as alertedRegionsReady, refresh as refreshAlertedRegions } from './alertedRegionsStore.js';
import { startStatusBar } from './statusBar.js';
import { addScreenshotControl } from './screenshot.js';
import { KYIV_RAION_BORDERS } from './kyivRaionBorders.js';
import { OBLAST_BORDERS } from './oblastBorders.js';
import { RAION_MIN_ZOOM } from './zoomTiers.js';
import { RAION_BORDERS } from './raionBorders.js';
import { normalizeOblastName, normalizeRaionName } from './regionNameUtils.js';
import { createSearchControl } from './mapSearch.js';
import { createKyivRaionLabels } from './kyivRaionLabels.js';
import { UKRAINE_OUTLINE } from './ukraineOutline.js';
import { metersPerPixel } from './outlineOffset.js';
import { OUTLINE_OFFSETS } from './outlineOffsets.js';

const UKRAINE_BOUNDS = [
    [44.387017, 22.138577],
    [52.380834, 40.220623],
];

function computeKyivBounds() {
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;

    Object.values(KYIV_RAION_BORDERS).forEach((ring) => {
        ring.forEach(([lat, lng]) => {
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
        });
    });

    return [
        [minLat, minLng],
        [maxLat, maxLng],
    ];
}

const KYIV_BOUNDS = computeKyivBounds();

const KYIV_TILES_URL = 'https://alert-proxy-ua.duckdns.org/live/tiles/kyiv.pmtiles';
const DETAIL_TILES_URL = 'https://alert-proxy-ua.duckdns.org/live/tiles/ukraine-lite.pmtiles';
const SATELLITE_TILES_URL = 'https://alert-proxy-ua.duckdns.org/live/tiles/landcover.pmtiles';
const RELIEF_TILES_URL = 'https://alert-proxy-ua.duckdns.org/live/tiles/hillshade.pmtiles';
const NAMES_BASE_URL = 'https://alert-proxy-ua.duckdns.org/live/tiles/';

const SATELLITE_BASEMAP = (() => {
    try {
        return localStorage.getItem('alertServer.satMap') !== '0';
    } catch (err) {
        return true;
    }
})();
const MAP_MIN_ZOOM = window.alertServerLiveMap.minZoom || 5;
const UKRAINE_MAX_ZOOM = 12;
const KYIV_MAX_ZOOM = 14;

const CenterControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-center-wrapper');
        const link = L.DomUtil.create('a', 'leaflet-control-center', container);
        link.href = '#';
        link.title = this.options.title;
        link.innerHTML = '<svg viewBox="0 0 122.88 109.78" width="22" height="20" aria-hidden="true"><path fill="currentColor" d="M28.94,13.7l.09-.09,5.65-5.67.15-.13c2.61-2.4,5.24-1.62,6.76,1.44a1.59,1.59,0,0,1,.16.54c1.25,10.35,2.1,20.29,3.34,30.64.25,3.42-2.08,4.84-5.24,4.47l-28.21-3c-4.92-.58-7.36-3.84-3.42-7.78,1.78-1.77,3.54-3.58,5.34-5.32l-13-13a2,2,0,0,1,0-2.8L13,.58a2,2,0,0,1,2.81,0L28.94,13.7Zm32.5,27.58A13.61,13.61,0,1,1,47.83,54.89,13.61,13.61,0,0,1,61.44,41.28Zm32.5,54.8-.09.09-5.66,5.67a.86.86,0,0,1-.14.13c-2.61,2.4-5.24,1.62-6.76-1.44a1.58,1.58,0,0,1-.16-.55C79.88,89.64,79,79.7,77.79,69.35c-.25-3.42,2.07-4.84,5.24-4.47l28.21,3c4.92.58,7.36,3.84,3.42,7.78-1.78,1.77-3.54,3.58-5.34,5.32l13,13a2,2,0,0,1,0,2.8l-12.42,12.43a2,2,0,0,1-2.81,0L93.94,96.08Zm-65,0,.09.09,5.65,5.67.15.13c2.61,2.4,5.24,1.62,6.76-1.44a1.58,1.58,0,0,0,.16-.55C43,89.64,43.85,79.7,45.09,69.35c.25-3.42-2.08-4.84-5.24-4.47l-28.21,3c-4.92.58-7.36,3.84-3.42,7.78C10,77.44,11.76,79.25,13.56,81L.58,94a2,2,0,0,0,0,2.8L13,109.21a2,2,0,0,0,2.81,0L28.94,96.08Zm65-82.38-.09-.09L88.19,7.94a.86.86,0,0,0-.14-.13c-2.61-2.4-5.24-1.62-6.76,1.44a1.59,1.59,0,0,0-.16.54C79.88,20.14,79,30.08,77.79,40.43c-.25,3.42,2.07,4.84,5.24,4.47l28.21-3c4.92-.58,7.36-3.84,3.42-7.78-1.78-1.77-3.54-3.58-5.34-5.32l13-13a2,2,0,0,0,0-2.8L109.88.58a2,2,0,0,0-2.81,0L93.94,13.7Z"/></svg>';
        L.DomEvent.on(link, 'click', (event) => {
            L.DomEvent.preventDefault(event);
            this.options.onClick();
        });
        return container;
    },
});

const KYIV_ICON_HTML =
    '<svg viewBox="0 0.8 19.938 19.1" width="27" height="26" aria-hidden="true"><path fill="currentColor" d="M19.54,11.99c-0.33-0.88-0.34-1.50-0.26-1.87c0.08-0.36,0.27-0.47,0.27-0.47s-0.01-0.16-0.17-0.16 c-0.15,0-0.62,0.04-0.62,0.04s0.36-0.69,0.42-1.80c0.05-1.10-0.03-1.75-0.03-1.9s-0.05-0.29-0.23-0.43 c-0.17-0.14-0.34-0.43-0.26-0.47c0.08-0.04,0.20,0.03,0.23-0.05c0.01-0.03,0.00-0.08,0-0.12 c-0.00-0.06-0.01-0.11-0.01-0.11c0.02-0.01,0.08-0.00,0.08-0.04c-0.05-0.08-0.13-0.15-0.13-0.15 s0.01-0.11-0.03-0.20c-0.04-0.08-0.21-0.23-0.40-0.18c-0.18,0.04-0.35,0.03-0.36,0.30 c-0.00,0.16,0.10,0.17,0.08,0.25s-0.00,0.20-0.05,0.26c-0.06,0.06-0.39-0.30-0.62-0.39 c-0.23-0.08-0.42-0.08-0.42-0.08l-0.27,0.23c0,0-0.91-0.27-1.40-0.28c-0.49-0.01-0.62,0.05-0.53,0.26 c0.08,0.20,0.26,0.40,0.16,0.49c-0.10,0.08-0.20,0.20-0.10,0.27c0.10,0.07,0.23,0.11,0.23,0.11 s-0.44,0.58,0.43,0.52c0.88-0.05,1.10-0.30,1.10-0.30s0.23,0.03,0.30,0.08c0.07,0.05,0.20,0.16,0.24,0.17 c0.04,0.01,0.13,0.17,0.46,0.18c0.33,0.01,0.42-0.02,0.47,0.07c0.06,0.09,0.30,0.33,0.27,0.50 s-0.33,0.27-0.47,0.50c-0.29,0.51-0.13,1.15-0.88,1.93c-0.17,0.17-0.41,0.46-0.60,0.72 c-0.18,0.26-0.26,0.53-0.26,0.53s0.26,0.24,0.63,0.45c0.37,0.20,0.59,0.40,0.59,0.40l-0.02,0.24 c0,0,0.68,0.18,0.50,0.47c-0.17,0.29-0.69,0.29-0.69,0.29l0.01,0.39l0.55-0.01c0,0-0.01,0.74-1.95,1.05 c-1.53,0.25-4.27,0.31-5.64,0.33l0.07-4.88l0.00-0.24c0,0,0.39-0.18,0.24-0.43c-0.10-0.17-0.19-0.29-0.24-0.34 l0.09-5.85l0.16-0.09l-0.26-1.02L9.99,2.17l0.20,0.10l-0.05,3.38L10.08,8.08c0,0-0.05,0.11-0.18,0.17 C9.77,8.31,9.71,8.23,9.71,8.23s-0.1-0.34-0.45-0.65C8.91,7.28,8.69,7.21,8.69,7.21l0.02-0.18 c0,0,0.20,0.11,0.26,0.04C9.04,6.99,9.03,6.89,8.99,6.79C8.94,6.69,8.95,6.61,8.94,6.57 C8.93,6.52,9.04,6.55,9.04,6.49c0-0.05-0.17-0.25-0.17-0.25S8.84,6.03,8.78,5.93 c-0.06-0.10-0.14-0.12-0.42-0.05C8.08,5.95,7.99,6.06,8.03,6.26C8.05,6.47,8.11,6.55,8.05,6.60 C7.99,6.64,7.88,6.73,7.95,6.80C8.03,6.87,8.14,6.93,8.14,6.93L8.10,7.18L7.73,7.25c0,0,0.08-0.23-0.01-0.29 C7.62,6.90,7.56,6.86,7.56,6.86l0.00-4.75l0.16-0.07L7.47,1.00L7.21,2.02l0.16,0.09L7.37,6.90 c0,0-0.11,0.11-0.06,0.22c0.02,0.06,0.05,0.12,0.07,0.18v0.23C7.32,7.7,7.21,7.90,7.21,7.90 S7.05,7.37,6.86,7.22c-0.18-0.14-0.43-0.2-0.43-0.2V6.74c0,0,0.14-0.04,0.20-0.11 c0.05-0.07,0.01-0.17-0.04-0.26C6.53,6.28,6.54,6.13,6.49,5.95C6.43,5.75,6.37,5.80,6.37,5.80 S6.33,5.63,6.08,5.67C5.83,5.71,5.75,5.83,5.76,6.09c0.01,0.26-0.08,0.26-0.07,0.39 c0.01,0.13,0.13,0.26,0.18,0.26c0.06,0,0.07,0.11-0.02,0.18c-0.1,0.07-0.64,0.25-0.64,0.25S5.14,7.77,5.17,8.25 C5.2,8.73,5.30,8.90,5.41,8.97c0.11,0.07,0.17,0.11,0.17,0.11S5.49,9.44,5.46,9.74 c-0.02,0.30-0.02,0.40-0.02,0.40l-0.26-0.11c0,0-0.07-0.26-0.07-0.39c0-0.13-0.01-0.39-0.02-0.49 c-0.01-0.1-0.07-0.72-0.01-0.97c0.05-0.24-0.03-0.50-0.01-0.59C5.05,7.5,5.06,7.34,4.95,7.19 C4.83,7.05,4.79,7.00,4.66,6.94C4.53,6.89,4.41,6.90,4.39,6.77c-0.03-0.13-0.01-0.26-0.01-0.26 s0.15,0.02,0.20-0.22C4.62,6.05,4.65,5.95,4.49,5.87c0,0,0.06-0.16-0.06-0.34c-0.13-0.17-0.29-0.13-0.29-0.13 l-0.1-0.02c0,0-0.24,0.02-0.33,0.19c-0.08,0.15-0.04,0.22-0.04,0.32c0,0.1-0.13,0.22-0.01,0.30 C3.68,6.23,3.60,6.42,3.73,6.47c0.12,0.04,0.12,0.04,0.12,0.04s0.06,0.21-0.02,0.18 C3.75,6.67,3.56,6.52,3.31,6.55C3.07,6.58,2.86,6.58,2.72,6.65C2.57,6.73,2.66,6.75,2.44,6.75s-0.47,0-0.47,0 s-0.1-0.10-0.14-0.10c-0.04,0-0.59-0.02-0.59-0.02L1.09,6.69L0.72,6.67L0.53,6.61c0,0-0.07-0.17-0.11-0.17 c0,0,0.12-1.37,0.56-1.88C1.41,4.04,1.64,4.08,2.11,3.99c0.46-0.10,0.84-0.24,1.04-0.46 C3.36,3.30,3.44,3.06,3.44,3.06s0.04-0.18-0.03-0.04C3.15,3.41,3.04,3.51,2.88,3.59 c-0.62,0.30-0.89,0.19-1.41,0.37C0.95,4.13,0.77,4.32,0.53,4.86C0.28,5.39,0.16,6.47,0.16,6.47 S0.03,6.54,0.03,6.65c0,0.11-0.07,0.32-0.01,0.36C0.08,7.06,0.12,7.03,0.12,7.03s0.02,1.30,0.36,1.94 c0.25,0.49,0.59,0.63,0.74,0.68c0.07,0.43,0.18,0.90,0.04,1.25c-0.20,0.49-0.35,1.02-0.35,1.02 s0.63,0.34,0.87,0.43c0.23,0.08,0.30,0.17,0.30,0.17L2.07,12.89c0,0,0.25,0.24,0.59,0.28 c0.33,0.04,0.56,0.17,0.69,0.26c0.13,0.09,0.10,0.39,0.10,0.39l-3.00-0.24l0.26,1.14l0.94,0.14l0.24,0.61 c0,0,0.85,0.47,2.04,0.76c1.18,0.29,3.29,0.29,3.29,0.29s-0.35,0.68,0.07,1.10c0.42,0.42,1.01,0.32,1.01,0.32 v0.91h1.29V18.12c0,0,0.64,0.04,0.79,0.01s0.25-0.14,0.25-0.14v0.9l1.72,0.03l-0.09-1.12l1.12-0.01v1.14h2.01 c0,0,0.04-0.87-0.10-1.45s-0.46-1.10-0.50-1.11c-0.04-0.01,3.26-0.23,4.39-1.32 C20.35,13.95,19.87,12.88,19.54,11.99z M1.18,9.12C1.17,9.23,1.18,9.34,1.19,9.46 c-0.11-0.05-0.35-0.22-0.57-0.72C0.29,8.03,0.38,7.05,0.38,7.05s0.02-0.01,0.13-0.01 c0.10,0,0.34,0.10,0.34,0.10l1.13,0.42C1.99,7.55,1.21,8.57,1.18,9.12z M5.77,13.34 c-0.03,0.12-0.04,0.23-0.02,0.28c0.02,0.04,0.02,0.27,0.02,0.27l-0.64-0.06c0,0,0.14-0.05,0.10-0.14 C5.19,13.59,5.07,13.56,5.07,13.54c0-0.02-0.02-0.18,0.03-0.36c0.06-0.18,0.25-0.53,0.25-0.53l0.39,0.04 C5.75,12.68,5.81,13.22,5.77,13.34z M7.21,14.00c0,0,0.11-0.09,0.08-0.15c-0.03-0.05-0.24-0.03-0.41-0.07 c-0.17-0.03-0.28-0.14-0.31-0.28c-0.02-0.13,0.07-0.78,0.07-0.78l0.22,0.01c0,0,0.19-2.16,0.19-2.67 c0-0.5,0.01-0.75-0.03-0.91c-0.04-0.16-0.08-0.28-0.08-0.28l0.02-0.22c0,0,0.12,0.09,0.26,0.10 C7.29,8.73,7.34,8.72,7.37,8.71v2.06c-0.00,0.05-0.00,0.10-0.01,0.13c-0.05,0.39,0.04,1.48-0.00,1.73 c-0.04,0.26-0.02,0.76-0.02,0.76l0.05,0.05v0.52H7.21z M9.99,14.03C9.72,14.04,9.56,14.04,9.56,14.04 s0.04-0.17-0.05-0.18s-0.40,0.01-0.47-0.14C8.95,13.54,9.04,13.3,9.04,13.3l0.18-0.02l0.20-1.32 c0,0,0.50-0.07,0.52-0.20c0.01-0.13,0.07-0.66,0.07-0.66L9.99,14.03z"/></svg>';
const UKRAINE_ICON_HTML =
    '<svg viewBox="20 20 852 1280" width="18" height="27" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M 441.0 25.3 C 419.8 47.3, 404.9 77.1, 397.2 112.8 C 393.8 128.3, 393.4 186.3, 396.3 236.5 C 397.2 251.9, 398.6 282.9, 399.4 305.5 C 406.1 484.4, 404.2 533.6, 388.3 603 C 372.0 674.1, 338.9 751.0, 301.7 803.9 C 291.5 818.5, 291.7 818.4, 275.4 818.8 C 224.3 820.1, 187.8 781.3, 200.7 739.4 C 208.7 713.5, 240.2 693.5, 272.6 693.7 C 282.2 693.7, 284.9 693.4, 285.3 692.4 C 285.6 691.6, 283.6 673.5, 280.9 652.2 C 278.1 630.9, 271.2 575.4, 265.4 529 C 246.9 380.3, 246.9 380.0, 227.3 334 C 188.8 243.8, 129.8 176.2, 46 126.5 C 33.8 119.3, 23.3 114.0, 21.2 114.0 C 20.2 114, 20 207.7, 20 579.5 L 20 1045 136.4 1045 C 219.6 1045, 253.6 1045.3, 255.3 1046.1 C 258.5 1047.5, 259.3 1049.3, 263.0 1063.2 C 282.9 1139.2, 324.9 1201.0, 388.5 1248.3 C 418.7 1270.8, 436.8 1286.5, 443.0 1295.6 C 446.8 1301.0, 446.5 1301.1, 452 1293.8 C 460.5 1282.3, 471.6 1272.7, 502.6 1250.2 C 557.2 1210.5, 598.5 1155.8, 621.3 1092.7 C 625.9 1080.2, 632.3 1058.4, 633.4 1051.7 C 634.6 1044.4, 625.3 1045, 755.2 1045 L 872 1045 872 579.5 C 872 323.4, 871.7 114, 871.4 114 C 869.6 114, 843.3 128.2, 833.3 134.6 C 726.8 202.5, 651.7 319.1, 639.4 435.5 C 638.6 443.7, 635.9 466.0, 633.4 485 C 621.3 579.8, 607.9 688.7, 608.2 690.9 C 608.5 693.5, 608.5 693.5, 621 693.5 C 654.6 693.7, 686.3 715.1, 693.4 742.5 C 704.4 784.6, 662.6 824.2, 612.6 819.0 C 601.5 817.8, 600.5 817.2, 591.7 804.4 C 541.4 731.5, 505.3 634.1, 494.1 540.5 C 487.9 489.0, 488.5 412.6, 496.4 247 C 499.2 189.0, 500.1 148.1, 499.0 134.3 C 495.5 93.6, 482.1 60.7, 456 29.0 C 447.1 18.4, 447.6 18.5, 441.0 25.3 M 797.6 254.3 C 797.3 255.2, 793.0 261.2, 788.2 267.7 C 739.9 331.7, 719.5 382.1, 711.0 458.1 C 707.1 492.9, 703.6 519.2, 694.9 581 C 685.7 645.8, 685.5 640.3, 697.7 647.0 C 729.1 664.1, 749.9 686.8, 760.0 714.7 C 763.1 723.3, 762.3 723.0, 782.1 722.7 L 799.5 722.5 799.7 489.1 C 799.8 360.8, 799.6 255.1, 799.1 254.3 C 798.3 252.9, 798.2 252.9, 797.6 254.3 M 93 487.8 C 93 678.9, 93.2 720.9, 94.3 721.8 C 95.1 722.5, 101.8 722.9, 111.9 723.0 C 130.9 723.1, 130.3 723.4, 133.9 713 C 142.5 687.9, 165.8 663.0, 195.6 646.9 C 207.0 640.7, 206.7 641.4, 204.1 622.3 C 202.9 614.1, 201.3 602.3, 200.5 596 C 198.9 583.4, 186.1 487.3, 182.9 464 C 181.9 456.0, 180.1 442.1, 179.0 433.2 C 172.2 378.0, 150.0 327.8, 106.7 269.7 C 100.6 261.6, 95.0 255, 94.3 255 C 93.2 255, 93 292.7, 93 487.8 M 440.0 686.7 C 419.3 745.2, 398.5 788.9, 372.1 829.4 C 369.2 833.7, 367.1 837.8, 367.3 838.4 C 367.6 839.6, 373.9 843.5, 415.7 868.8 C 434.2 880.0, 444.9 885.9, 446.7 885.9 C 449.7 885.9, 523.5 841.7, 525.3 838.8 C 526.0 837.6, 524.4 834.2, 517.7 823.8 C 492.3 783.9, 471.1 738.5, 451.9 683 C 449.6 676.1, 447.3 670.1, 447.0 669.7 C 446.6 669.2, 443.4 676.9, 440.0 686.7 M 94.6 790.8 C 91.8 793.9, 92.1 978.4, 94.9 979.9 C 98.4 981.8, 247.8 980.8, 248.9 979.0 C 250.0 977.3, 250.3 974.2, 251.9 953 C 253.2 935.9, 255.8 919.6, 260.0 903.2 C 264.4 885.5, 264.8 886.5, 253.3 884.9 C 195.6 876.9, 150.3 844.6, 134.0 800 C 132.3 795.3, 130.1 790.9, 129.2 790.2 C 126.3 788.0, 96.7 788.5, 94.6 790.8 M 764.2 789.8 C 763.4 790.3, 761.3 794.8, 759.4 800.0 C 742.1 846.5, 701.3 874.6, 635.5 885.6 C 629.2 886.7, 629.0 887.4, 632.3 899.3 C 637.2 916.9, 641.1 941.4, 642.5 964.5 C 643.2 976.0, 644.3 979.5, 647.3 980.3 C 653.6 982.0, 795.7 981.0, 797.9 979.2 C 800.0 977.5, 800.0 977.5, 800.0 886.5 C 800.0 836.4, 800.0 794.7, 800.0 793.8 C 799.9 789.5, 797.6 788.9, 781.1 789.0 C 772.5 789.0, 764.9 789.3, 764.2 789.8 M 337.2 903.7 C 333.2 906.4, 328.1 931.8, 325.9 960.3 C 324.7 976.8, 324.6 975.6, 327 978 C 329.2 980.2, 402.9 981.1, 407.0 978.9 C 415.4 974.5, 400.7 940.2, 383.6 924.2 C 370.8 912.3, 343.0 900.0, 337.2 903.7 M 544.5 904.9 C 528.6 909.2, 511.0 920.6, 501.4 932.7 C 489.9 947.4, 480.8 973.6, 485.6 978.4 C 487.9 980.7, 565.4 980.3, 567.0 978 C 569.5 974.4, 566.0 937.3, 561.3 917.6 C 557.7 902.2, 556.8 901.6, 544.5 904.9 M 339.5 1046.5 C 337.5 1048.5, 337.5 1048.6, 340.4 1060.5 C 347.4 1089.3, 360.5 1117.2, 378.1 1141 C 384.3 1149.3, 406.5 1173, 408.1 1173 C 408.6 1173, 409 1144.6, 409 1110.0 C 409 1048.8, 408.9 1047.0, 407.0 1046.0 C 403.5 1044.1, 341.4 1044.6, 339.5 1046.5 M 485.6 1046.2 C 484.1 1047.4, 483.9 1052.1, 484.2 1110.3 L 484.5 1173.2 490.1 1168.6 C 504.8 1156.7, 525.4 1128.7, 536.3 1106 C 548.9 1079.8, 558.1 1047.4, 553.4 1045.6 C 550.1 1044.3, 487.4 1044.9, 485.6 1046.2"/></svg>';

const KyivToggleControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function () {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-kyiv-toggle-wrapper');
        const link = L.DomUtil.create('a', 'leaflet-control-kyiv-toggle', container);
        link.href = '#';
        this._link = link;
        this._setLabel(false);

        L.DomEvent.on(link, 'click', (event) => {
            L.DomEvent.preventDefault(event);
            this.options.onToggle();
        });
        return container;
    },
    _setLabel: function (active) {
        this._link.innerHTML = active ? UKRAINE_ICON_HTML : KYIV_ICON_HTML;
        this._link.title = active ? this.options.offTitle : this.options.onTitle;
        this._link.setAttribute('aria-label', active ? this.options.offLabel : this.options.onLabel);
        this._link.setAttribute('role', 'button');
    },
    setActive: function (active) {
        this._setLabel(active);
        this._link.classList.toggle('active', active);
    },
});

async function main() {
    const forceKyivMode = await window.alertServerLiveMap.consumePendingKyivMode();
    const strings = await window.alertServerLiveMap.getStrings();
    const settings = await window.alertServerLiveMap.getSettings();
    const baseMapUrl = await window.alertServerLiveMap.getBaseMapUrl();

    document.title = strings.appName;

    const map = L.map('map', {
        center: [48.4, 31.2],
        zoom: 6,
        minZoom: MAP_MIN_ZOOM,
        maxZoom: UKRAINE_MAX_ZOOM,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        bounceAtZoomLimits: false,
        attributionControl: true,

        renderer: L.svg({ padding: 1 }),
    });

    const floatingPanes = ['popupPane', 'tooltipPane'].map((name) => map.getPane(name));
    floatingPanes.forEach((pane) => map.getContainer().appendChild(pane));
    const syncFloatingPanes = () => floatingPanes.forEach((pane) => L.DomUtil.setPosition(pane, map._getMapPanePos()));
    map.on('move zoom viewreset moveend zoomend resize', syncFloatingPanes);
    syncFloatingPanes();

    map.getContainer().classList.add('map-transitioning');

    let resolveMapRevealed;
    const mapRevealedPromise = new Promise((resolve) => {
        resolveMapRevealed = resolve;
    });

    let kyivModeActive = false;
    function applyBaseFit() {
        map.stop();
        map.setMinZoom(MAP_MIN_ZOOM);
        map.setMaxZoom(Math.max(KYIV_MAX_ZOOM, UKRAINE_MAX_ZOOM));
        map.setMaxBounds(null);
        const bounds = kyivModeActive ? KYIV_BOUNDS : UKRAINE_BOUNDS;

        const fitPadding = kyivModeActive ? [0, 0] : window.alertServerLiveMap.fitPadding || [0, 0];
        map.fitBounds(bounds, { animate: false, padding: fitPadding });
        map.setMaxZoom(kyivModeActive ? KYIV_MAX_ZOOM : UKRAINE_MAX_ZOOM);
        map.setMinZoom(map.getZoom());
    }

    function fitAndLockMinZoom() {
        applyBaseFit();
        requestAnimationFrame(() => requestAnimationFrame(applyBaseFit));
    }

    if (SATELLITE_BASEMAP) map.getContainer().classList.add('sat-basemap');

    const baseMapOverlay = L.imageOverlay(baseMapUrl, UKRAINE_BOUNDS).addTo(map);
    setOpacity(baseMapOverlay.getElement(), 0);

    const isDarkMap = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const osmLabelsPane = map.createPane('osmLabelsPane');
    osmLabelsPane.style.zIndex = 450;
    osmLabelsPane.style.pointerEvents = 'none';

    const kyivTilesUrl = window.alertServerLiveMap.kyivTilesUrl || KYIV_TILES_URL;
    const kyivLanguage = settings.language === 'English' ? 'en' : 'uk';
    const kyivImageryLayer = window.alertOsmBasemap.create({
        url: kyivTilesUrl,
        bounds: L.latLngBounds(KYIV_BOUNDS).pad(0.15),
        dark: isDarkMap,
        satellite: SATELLITE_BASEMAP,
        boundaries: !SATELLITE_BASEMAP,
        part: SATELLITE_BASEMAP ? 'paint' : 'all',
        lang: settings.language === 'English' ? 'en' : 'uk',
        attribution: `<span class="attr-item"><a href="#" id="osmAttribution">${strings.liveMapOsmAttribution}</a></span>`,
    });
    const kyivOsmLabelsLayer = SATELLITE_BASEMAP
        ? window.alertOsmBasemap.create({ url: kyivTilesUrl, bounds: L.latLngBounds(KYIV_BOUNDS).pad(0.15), dark: isDarkMap, satellite: true, lang: kyivLanguage, part: 'labels', pane: 'osmLabelsPane', labels: 'city' })
        : null;
    const DETAIL_MIN_ZOOM = 9;
    const detailTilesUrl = window.alertServerLiveMap.detailTilesUrl || DETAIL_TILES_URL;
    const detailLayer = detailTilesUrl
        ? window.alertOsmBasemap.create({
              url: detailTilesUrl,
              dark: isDarkMap,
              lang: settings.language === 'English' ? 'en' : 'uk',
              attribution: '<span class="attr-item"><a href="#" id="osmDetailAttribution">© OpenStreetMap contributors</a></span>',
              overlay: SATELLITE_BASEMAP,
              part: SATELLITE_BASEMAP ? 'paint' : 'all',
              labels: window.matchMedia('(pointer: coarse)').matches ? 'places-major' : 'places',
              boundaries: false,
              maxDataZoom: 12,
          })
        : null;

    const detailLabelsLayer =
        SATELLITE_BASEMAP && detailTilesUrl
            ? window.alertOsmBasemap.create({
                  url: detailTilesUrl,
                  dark: isDarkMap,
                  lang: kyivLanguage,
                  overlay: true,
                  part: 'labels',
                  pane: 'osmLabelsPane',
                  labels: window.matchMedia('(pointer: coarse)').matches ? 'places-major' : 'places',
                  boundaries: false,
                  maxDataZoom: 12,
              })
            : null;

    const satelliteLayer = SATELLITE_BASEMAP ? window.alertOsmBasemap.createSatellite({ url: window.alertServerLiveMap.landcoverTilesUrl || SATELLITE_TILES_URL, dark: isDarkMap, attribution: `<span class="attr-item"><a href="#" id="worldcoverAttribution">${strings.liveMapWorldcoverAttribution}</a></span>` }) : null;
    const reliefLayer = SATELLITE_BASEMAP ? window.alertOsmBasemap.createRelief({ url: window.alertServerLiveMap.hillshadeTilesUrl || RELIEF_TILES_URL, dark: isDarkMap, attribution: `<span class="attr-item"><a href="#" id="reliefAttribution">${strings.liveMapReliefAttribution}</a></span>` }) : null;
    if (satelliteLayer) satelliteLayer.setZIndex(1);
    if (reliefLayer) reliefLayer.setZIndex(2);
    if (detailLayer && SATELLITE_BASEMAP) detailLayer.setZIndex(3);

    const raionBordersPane = map.createPane('raionBordersPane');
    raionBordersPane.style.zIndex = 456;
    raionBordersPane.style.pointerEvents = 'none';

    const outsideMaskPane = map.createPane('outsideMaskPane');
    outsideMaskPane.style.zIndex = 455;
    outsideMaskPane.style.pointerEvents = 'none';
    const outsideMaskRenderer = L.svg({ pane: 'outsideMaskPane', padding: 1 });
    const WORLD_MASK_RING = [
        [-85, -180],
        [-85, 180],
        [85, 180],
        [85, -180],
    ];
    const FADE_OFFSET_PX = 90;
    const FADE_OFFSET_MIN_M = 3000;
    const FADE_OFFSET_MAX_M = 7000;
    const OUTSIDE_BLUR_MIN_PX = 14;
    const OUTLINE_OFFSET_STEPS = Object.keys(OUTLINE_OFFSETS).map(Number);
    const OUTSIDE_BLUR_MAX_PX = 46;
    const outsideUkraineMask = L.polygon(
        [WORLD_MASK_RING, ...UKRAINE_OUTLINE],
        {
            pane: 'outsideMaskPane',
            renderer: outsideMaskRenderer,
            className: 'outside-mask-shape',
            stroke: false,
            fillColor: SATELLITE_BASEMAP ? (isDarkMap ? '#12161a' : '#b5bbc0') : isDarkMap ? '#101720' : '#a9bcc4',
            fillOpacity: 1,
            interactive: false,
        }
    );

    function refreshOutsideMask() {
        const mpp = metersPerPixel(map.getZoom());
        const meters = Math.min(FADE_OFFSET_MAX_M, Math.max(FADE_OFFSET_MIN_M, FADE_OFFSET_PX * mpp));
        const distance = OUTLINE_OFFSET_STEPS.reduce((best, step) => (Math.abs(step - meters) < Math.abs(best - meters) ? step : best));
        const rings = OUTLINE_OFFSETS[distance];
        outsideUkraineMask.setLatLngs([WORLD_MASK_RING, ...rings]);
        const blur = Math.min(OUTSIDE_BLUR_MAX_PX, Math.max(OUTSIDE_BLUR_MIN_PX, meters / mpp / 2));
        outsideMaskPane.style.setProperty('--outside-blur', `${blur}px`);
    }

    const oblastBordersLayer = L.layerGroup(
        Object.values(OBLAST_BORDERS).map((rings) =>
            L.polygon(rings, {
                pane: 'raionBordersPane',
                interactive: false,
                className: 'oblast-border',
                color: isDarkMap ? '#a8b1bd' : '#5e5238',
                fill: false,
                weight: 1,
                opacity: isDarkMap ? 0.12 : 0.14,
            })
        )
    );

    let sceneSwapping = false;

    function syncDetailLayer() {
        if (!detailLayer) return;
        const wanted = !kyivModeActive && !sceneSwapping && (SATELLITE_BASEMAP || map.getZoom() >= DETAIL_MIN_ZOOM);
        map.getContainer().classList.toggle('detail-map-on', wanted && map.getZoom() >= DETAIL_MIN_ZOOM);
        map.getContainer().classList.toggle('sat-map-on', wanted && SATELLITE_BASEMAP);
        if (wanted && !map.hasLayer(detailLayer)) {
            refreshOutsideMask();
            if (satelliteLayer) satelliteLayer.addTo(map);
            if (reliefLayer) reliefLayer.addTo(map);
            detailLayer.addTo(map);
            if (detailLabelsLayer) detailLabelsLayer.addTo(map);
            outsideUkraineMask.addTo(map);
        }
        else if (!wanted && map.hasLayer(detailLayer)) {
            map.removeLayer(detailLayer);
            if (detailLabelsLayer) map.removeLayer(detailLabelsLayer);
            if (reliefLayer) map.removeLayer(reliefLayer);
            if (satelliteLayer) map.removeLayer(satelliteLayer);
            map.removeLayer(outsideUkraineMask);
        }
        const oblastBordersWanted = wanted && SATELLITE_BASEMAP && map.getZoom() < RAION_MIN_ZOOM;
        if (oblastBordersWanted && !map.hasLayer(oblastBordersLayer)) oblastBordersLayer.addTo(map);
        else if (!oblastBordersWanted && map.hasLayer(oblastBordersLayer)) map.removeLayer(oblastBordersLayer);
    }
    const kyivLabelsLayer = createKyivRaionLabels(settings.language === 'English');

    let riverLayerWasOn = true;
    let occupiedTerritoryLayerWasOn = true;

    const WORLD_RING = [
        [-85, -180],
        [-85, 180],
        [85, 180],
        [85, -180],
    ];
    const kyivMaskPane = map.createPane('kyivMaskPane');
    kyivMaskPane.style.zIndex = 455;
    kyivMaskPane.style.pointerEvents = 'none';
    const kyivMaskRenderer = L.svg({ pane: 'kyivMaskPane', padding: 2 });
    const kyivMask = L.polygon([WORLD_RING, ...Object.values(KYIV_RAION_BORDERS)], {
        pane: 'kyivMaskPane',
        renderer: kyivMaskRenderer,
        className: 'kyiv-mask-shape',
        stroke: false,

        fillColor: SATELLITE_BASEMAP ? (isDarkMap ? '#12161a' : '#b5bbc0') : isDarkMap ? '#101720' : '#a9bcc4',
        fillOpacity: 1,
        interactive: false,
    });

    const OCCUPIED_WAIT_MS = 15000;
    const DATA_LOAD_MAX_FAILURES = 3;
    const KYIV_SCENE_FADE_MS = 450;
    const TILE_LOAD_TIMEOUT_MS = 5000;
    const RESIZE_SETTLE_POLL_MS = 50;
    const RESIZE_SETTLE_STABLE_TICKS = 3;
    const RESIZE_SETTLE_TIMEOUT_MS = 1500;
    let sceneToken = 0;

    function setOpacity(el, value) {
        if (!el) return;
        el.classList.add('kyiv-fade-layer');
        el.style.opacity = String(value);
    }

    function setOpacityInstant(el, value) {
        if (!el) return;
        const prevTransition = el.style.transition;
        el.style.transition = 'none';
        el.classList.add('kyiv-fade-layer');
        el.style.opacity = String(value);
        void el.offsetWidth;
        el.style.transition = prevTransition;
    }

    function fadeIn(el) {
        if (!el) return;
        setOpacity(el, 0);
        void el.offsetWidth;
        setOpacity(el, 1);
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function elementOf(layer) {
        return typeof layer.getContainer === 'function' ? layer.getContainer() : layer.getElement();
    }

    function waitForTilesLoaded(layer) {
        if (typeof layer.isLoading !== 'function' || !layer.isLoading()) return Promise.resolve();

        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                layer.off('load', onLoad);
                resolve();
            }, TILE_LOAD_TIMEOUT_MS);

            function onLoad() {
                clearTimeout(timeoutId);
                resolve();
            }
            layer.once('load', onLoad);
        });
    }

    function trackedTileLayers() {
        return [satelliteLayer, reliefLayer, detailLayer, detailLabelsLayer, kyivImageryLayer, kyivOsmLabelsLayer, kyivLabelsLayer].filter((layer) => layer && map.hasLayer(layer));
    }

    function waitForAllTiles() {
        return Promise.all(trackedTileLayers().map(waitForTilesLoaded));
    }

    function waitForImageLoaded(imgEl) {
        if (!imgEl || imgEl.complete) return Promise.resolve();
        return new Promise((resolve) => {
            imgEl.addEventListener('load', resolve, { once: true });
            imgEl.addEventListener('error', resolve, { once: true });
        });
    }

    function waitForSizeSettled(container) {
        return new Promise((resolve) => {
            const start = Date.now();
            let lastWidth = container.clientWidth;
            let lastHeight = container.clientHeight;
            let stableTicks = 0;

            function check() {
                const width = container.clientWidth;
                const height = container.clientHeight;
                stableTicks = width === lastWidth && height === lastHeight ? stableTicks + 1 : 0;
                lastWidth = width;
                lastHeight = height;

                if (stableTicks >= RESIZE_SETTLE_STABLE_TICKS || Date.now() - start > RESIZE_SETTLE_TIMEOUT_MS) {
                    resolve();
                    return;
                }
                setTimeout(check, RESIZE_SETTLE_POLL_MS);
            }
            check();
        });
    }

    function sceneLayersFor(active) {
        return active ? [kyivImageryLayer, kyivLabelsLayer, ...(kyivOsmLabelsLayer ? [kyivOsmLabelsLayer] : [])] : [baseMapOverlay];
    }

    async function waitForSceneReady(active) {
        if (active) {
            await Promise.all([waitForTilesLoaded(kyivImageryLayer), waitForTilesLoaded(kyivLabelsLayer)]);
        } else {
            await waitForImageLoaded(baseMapOverlay.getElement());
        }
        await sleep(80);
        await waitForAllTiles();
        await sleep(50);
    }

    async function transitionRefit(mutate) {
        const token = ++sceneToken;
        const active = kyivModeActive;
        const container = map.getContainer();

        container.classList.add('map-transitioning', 'map-transitioning-instant');
        sceneLayersFor(active).forEach((layer) => setOpacityInstant(elementOf(layer), 0));
        void container.offsetWidth;
        container.classList.remove('map-transitioning-instant');
        if (token !== sceneToken) return;

        await waitForSizeSettled(container);
        if (token !== sceneToken) return;

        mutate();

        await waitForSceneReady(active);
        if (token !== sceneToken) return;

        container.classList.remove('map-transitioning');
        sceneLayersFor(active).forEach((layer) => fadeIn(elementOf(layer)));
    }

    async function swapScene(active) {
        const token = ++sceneToken;
        const container = map.getContainer();

        container.classList.add('map-transitioning');
        sceneLayersFor(!active).forEach((layer) => setOpacity(elementOf(layer), 0));
        await sleep(KYIV_SCENE_FADE_MS);
        if (token !== sceneToken) return;

        if (active) {
            map.removeLayer(baseMapOverlay);
            if (riverLayerWasOn) map.removeLayer(riverLayer);
            if (occupiedTerritoryLayerWasOn) map.removeLayer(occupiedTerritoryLayer);
            kyivImageryLayer.addTo(map);
            if (kyivOsmLabelsLayer) kyivOsmLabelsLayer.addTo(map);
            kyivLabelsLayer.addTo(map);

            kyivMask.addTo(map);
            kyivMask.bringToBack();
        } else {
            map.removeLayer(kyivImageryLayer);
            if (kyivOsmLabelsLayer) map.removeLayer(kyivOsmLabelsLayer);
            map.removeLayer(kyivLabelsLayer);
            map.removeLayer(kyivMask);
            baseMapOverlay.addTo(map);
            if (riverLayerWasOn) riverLayer.addTo(map);
            if (occupiedTerritoryLayerWasOn) occupiedTerritoryLayer.addTo(map);
        }

        regionStatusLayer.setKyivMode(active);
        labelsLayer.setKyivMode(active);
        threatsLayer.setKyivMode(active);
        fitAndLockMinZoom();
        sceneSwapping = false;
        syncDetailLayer();

        await waitForSceneReady(active);
        if (token !== sceneToken) return;

        container.classList.remove('map-transitioning');
        sceneLayersFor(active).forEach((layer) => fadeIn(elementOf(layer)));
    }

    fitAndLockMinZoom();
    map.attributionControl.setPrefix(false);
    map.on('zoomend', syncDetailLayer);

    let zoomSettleToken = 0;
    let zoomSettleOwned = false;
    let zoomSettleSafety = null;

    function restorePreloadRing() {
        window.__alertPreloadRing = undefined;
        trackedTileLayers().forEach((layer) => {
            if (typeof layer._update === 'function') layer._update();
        });
    }

    function beginSettle() {
        const container = map.getContainer();
        if (sceneSwapping || (container.classList.contains('map-transitioning') && !zoomSettleOwned)) return;
        zoomSettleToken++;
        zoomSettleOwned = true;
        window.__alertPreloadRing = 0;
        container.classList.add('map-transitioning');
        clearTimeout(zoomSettleSafety);
        zoomSettleSafety = setTimeout(() => {
            if (!zoomSettleOwned) return;
            zoomSettleOwned = false;
            map.getContainer().classList.remove('map-transitioning');
            restorePreloadRing();
        }, 9000);
    }

    async function finishSettle() {
        if (!zoomSettleOwned) return;
        const token = zoomSettleToken;
        await sleep(90);
        await waitForAllTiles();
        await sleep(70);
        if (token !== zoomSettleToken || sceneSwapping || !zoomSettleOwned) return;
        zoomSettleOwned = false;
        clearTimeout(zoomSettleSafety);
        map.getContainer().classList.remove('map-transitioning');
        restorePreloadRing();
    }

    function settleBeforeJump(center, zoom) {
        if (Math.abs(zoom - map.getZoom()) >= 0.01) return;
        if (map.latLngToContainerPoint(center).distanceTo(map.getSize().divideBy(2)) <= 40) return;
        beginSettle();
    }

    map.on('zoomstart', beginSettle);
    map.on('zoomend', finishSettle);
    map.on('moveend', finishSettle);
    if (SATELLITE_BASEMAP) syncDetailLayer();
    map.on('zoomend', () => {
        if (map.hasLayer(outsideUkraineMask)) refreshOutsideMask();
    });

    const ATTRIBUTION_LINKS = {
        osmAttribution: 'https://www.openstreetmap.org/copyright',
        osmDetailAttribution: 'https://www.openstreetmap.org/copyright',
        worldcoverAttribution: 'https://creativecommons.org/licenses/by/4.0/',
        reliefAttribution: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
        appAttribution: 'https://github.com/sergeiown/Alert_Server',
        alertsAttribution: 'https://alerts.in.ua',
        ukraineAlarmAttribution: 'https://www.ukrainealarm.com',
        neptunAttribution: 'https://neptun.in.ua',
        deepStateAttribution: 'https://deepstatemap.live/',
    };

    map.attributionControl.getContainer().addEventListener('click', (event) => {
        const link = event.target.closest('a[id]');
        const url = link ? ATTRIBUTION_LINKS[link.id] : null;
        if (!url) return;
        event.preventDefault();
        window.alertServerLiveMap.openExternal(url);
    });

    function labelledLink(text, id, name) {
        if (name && text.includes(name)) {
            return `<span class="attr-item">${text.replace(name, `<a href="#" id="${id}">${name}</a>`)}</span>`;
        }
        const split = text.lastIndexOf(': ');
        if (split < 0) return `<span class="attr-item"><a href="#" id="${id}">${text}</a></span>`;
        return `<span class="attr-item">${text.slice(0, split + 1)} <a href="#" id="${id}">${text.slice(split + 2)}</a></span>`;
    }

    map.attributionControl.addAttribution(labelledLink(strings.liveMapAppAttribution, 'appAttribution'));
    map.attributionControl.addAttribution(
        `<span class="attr-item">${strings.liveMapAlertsAttributionPrefix} <a href="#" id="alertsAttribution">alerts.in.ua</a>, <a href="#" id="ukraineAlarmAttribution">UkraineAlarm</a></span>`
    );
    map.attributionControl.addAttribution(labelledLink(strings.liveMapNeptunAttribution, 'neptunAttribution'));

    const deepStateAttributionHtml = labelledLink(strings.liveMapDeepStateAttribution, 'deepStateAttribution', 'DeepState');
    map.attributionControl.addAttribution(deepStateAttributionHtml);

    new CenterControl({ title: strings.liveMapCenterButtonTitle, onClick: fitAndLockMinZoom }).addTo(map);

    addScreenshotControl(map, strings);

    const fullScreenIconColor = isDarkMap ? '#c6d9ee' : '#36516f';
    const fullScreenIconOptions = {
        enterFullScreenIcon: `data:image/svg+xml;base64,${btoa(
            `<svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg"><path fill="${fullScreenIconColor}" d="M 47.61 21.40 C 48.85 21.40 49.51 20.72 49.51 19.48 L 49.51 13.73 C 49.51 8.91 47.07 6.49 42.15 6.49 L 36.43 6.49 C 35.19 6.49 34.51 7.17 34.51 8.37 C 34.51 9.58 35.19 10.26 36.43 10.26 L 42.10 10.26 C 44.40 10.26 45.74 11.51 45.74 13.94 L 45.74 19.48 C 45.74 20.72 46.42 21.40 47.61 21.40 Z M 8.38 21.40 C 9.60 21.40 10.25 20.72 10.25 19.48 L 10.25 13.94 C 10.25 11.51 11.57 10.26 13.91 10.26 L 19.58 10.26 C 20.80 10.26 21.48 9.58 21.48 8.37 C 21.48 7.17 20.80 6.49 19.58 6.49 L 13.84 6.49 C 8.96 6.49 6.48 8.91 6.48 13.73 L 6.48 19.48 C 6.48 20.72 7.16 21.40 8.38 21.40 Z M 13.84 49.50 L 19.58 49.50 C 20.80 49.50 21.48 48.82 21.48 47.62 C 21.48 46.41 20.80 45.73 19.58 45.73 L 13.91 45.73 C 11.57 45.73 10.25 44.48 10.25 42.05 L 10.25 36.51 C 10.25 35.27 9.57 34.59 8.38 34.59 C 7.14 34.59 6.48 35.27 6.48 36.51 L 6.48 42.23 C 6.48 47.08 8.96 49.50 13.84 49.50 Z M 36.43 49.50 L 42.15 49.50 C 47.07 49.50 49.51 47.06 49.51 42.23 L 49.51 36.51 C 49.51 35.27 48.83 34.59 47.61 34.59 C 46.39 34.59 45.74 35.27 45.74 36.51 L 45.74 42.05 C 45.74 44.48 44.40 45.73 42.10 45.73 L 36.43 45.73 C 35.19 45.73 34.51 46.41 34.51 47.62 C 34.51 48.82 35.19 49.50 36.43 49.50 Z"/></svg>`
        )}`,
        exitFullScreenIcon: `data:image/svg+xml;base64,${btoa(
            `<svg width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4a1 1 0 00-2 0v2.5a.5.5 0 01-.5.5H4a1 1 0 000 2h2.5A2.5 2.5 0 009 6.5V4zM9 20a1 1 0 11-2 0v-2.5a.5.5 0 00-.5-.5H4a1 1 0 110-2h2.5A2.5 2.5 0 019 17.5V20zM16 3a1 1 0 00-1 1v2.5A2.5 2.5 0 0017.5 9H20a1 1 0 100-2h-2.5a.5.5 0 01-.5-.5V4a1 1 0 00-1-1zM15 20a1 1 0 102 0v-2.5a.5.5 0 01.5-.5H20a1 1 0 100-2h-2.5a2.5 2.5 0 00-2.5 2.5V20z" fill="${fullScreenIconColor}"/></svg>`
        )}`,
    };

    L.control
        .fullScreenButton({
            title: strings.liveMapFullScreenTitle,
            enterFullScreenTitle: strings.liveMapEnterFullScreenTitle,
            exitFullScreenTitle: strings.liveMapExitFullScreenTitle,
            showNotification: false,
            ...fullScreenIconOptions,
            onFullScreenChange: () =>
                transitionRefit(() => {
                    map.invalidateSize();
                    fitAndLockMinZoom();
                }),
        })
        .addTo(map);

    function applyKyivMode(active) {
        kyivModeActive = active;
        sceneSwapping = true;
        syncDetailLayer();
        kyivToggle.setActive(active);

        map.getContainer().classList.toggle('kyiv-mode-active', active);

        if (active) {
            riverLayerWasOn = map.hasLayer(riverLayer);
            occupiedTerritoryLayerWasOn = map.hasLayer(occupiedTerritoryLayer);
            map.attributionControl.removeAttribution(deepStateAttributionHtml);
        } else {
            map.attributionControl.addAttribution(deepStateAttributionHtml);
        }

        riverLayer.options.minZoom = active ? Infinity : undefined;
        occupiedTerritoryLayer.options.minZoom = active ? Infinity : undefined;
        labelsLayer.options.minZoom = active ? Infinity : undefined;
        layersControl._checkDisabledLayers();

        swapScene(active);
    }

    function collectPoints(geometry, points = []) {
        if (!Array.isArray(geometry)) return points;
        if (geometry.length === 2 && typeof geometry[0] === 'number' && typeof geometry[1] === 'number') points.push(geometry);
        else geometry.forEach((part) => collectPoints(part, points));
        return points;
    }

    function focusRegion(names) {
        if (!Array.isArray(names) || !names.length) return;
        const inKyiv = names.includes('м. Київ');
        for (const raw of names) {
            if (raw === 'м. Київ') {
                if (!kyivModeActive) applyKyivMode(true);
                return;
            }
            const raionKey = normalizeRaionName(raw.replace(/\s*район\s*$/u, ''));
            const kyivRaion = inKyiv ? KYIV_RAION_BORDERS[raionKey] : null;
            const raion = inKyiv ? null : RAION_BORDERS[raionKey];
            const oblast = OBLAST_BORDERS[normalizeOblastName(raw)];
            const geometry = kyivRaion || raion || oblast;
            if (!geometry) continue;
            const bounds = L.latLngBounds(collectPoints(geometry));
            if (!bounds.isValid()) continue;
            const wantKyiv = Boolean(kyivRaion);
            const switching = kyivModeActive !== wantKyiv;
            if (switching) applyKyivMode(wantKyiv);
            const fit = () => {
                const targetZoom = Math.min(wantKyiv ? KYIV_MAX_ZOOM : UKRAINE_MAX_ZOOM, map.getBoundsZoom(bounds, false, L.point(60, 60)));
                settleBeforeJump(bounds.getCenter(), targetZoom);
                map.fitBounds(bounds, { animate: true, padding: [30, 30], maxZoom: wantKyiv ? KYIV_MAX_ZOOM : UKRAINE_MAX_ZOOM });
            };
            if (switching) setTimeout(fit, 1100);
            else fit();
            return;
        }
    }

    window.alertServerLiveMap.onFocusRegion((names) => focusRegion(names));

    let searchNamesPromise = null;
    function loadSearchNames() {
        if (!searchNamesPromise) {
            const base = window.alertServerLiveMap.namesBaseUrl || NAMES_BASE_URL;
            searchNamesPromise = fetch(`${base}names-ukraine.json`)
                .then((r) => r.json())
                .then((places) => ({ places }))
                .catch((error) => {
                    searchNamesPromise = null;
                    throw error;
                });
        }
        return searchNamesPromise;
    }

    function goToSearchEntry(entry) {
        if (entry.kind === 'place') {
            const zoom = entry.detail === 'city' || entry.detail === 'town' ? 11 : 12;
            const switching = kyivModeActive;
            if (switching) applyKyivMode(false);
            const fly = () => {
                const targetZoom = Math.min(map.getMaxZoom(), zoom);
                settleBeforeJump(L.latLng(entry.lat, entry.lng), targetZoom);
                map.flyTo([entry.lat, entry.lng], targetZoom, { duration: 0.8 });
            };
            if (switching) setTimeout(fly, 1100);
            else fly();
            return;
        }
        if (entry.kind === 'city') {
            if (entry.key === 'Київ') {
                focusRegion(['м. Київ']);
                return;
            }
            const switching = kyivModeActive;
            if (switching) applyKyivMode(false);
            const fly = () => {
                const targetZoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom(), 11));
                settleBeforeJump(L.latLng(entry.lat, entry.lng), targetZoom);
                map.flyTo([entry.lat, entry.lng], targetZoom, { duration: 0.8 });
            };
            if (switching) setTimeout(fly, 1100);
            else fly();
            return;
        }
        if (entry.kind === 'kyivRaion') focusRegion([`${entry.key} район`, 'м. Київ']);
        else if (entry.kind === 'raion') focusRegion([`${entry.key} район`]);
        else focusRegion(entry.key === 'Київ' ? ['м. Київ'] : [entry.key]);
    }

    const kyivToggle = new KyivToggleControl({
        onLabel: strings.liveMapKyivButtonLabel,
        offLabel: strings.liveMapUkraineButtonLabel,
        onTitle: strings.liveMapKyivButtonTitle,
        offTitle: strings.liveMapUkraineButtonTitle,
        onToggle: () => applyKyivMode(!kyivModeActive),
    }).addTo(map);

    window.alertServerLiveMap.onForceKyivMode(() => {
        if (!kyivModeActive) applyKyivMode(true);
    });

    const SearchControl = createSearchControl({ strings, isEnglish: settings.language === 'English', onSelect: goToSearchEntry, loadNames: loadSearchNames });
    new SearchControl().addTo(map);

    function baseFitZoom() {
        const bounds = kyivModeActive ? KYIV_BOUNDS : UKRAINE_BOUNDS;
        const padding = kyivModeActive ? [0, 0] : window.alertServerLiveMap.fitPadding || [0, 0];
        return map.getBoundsZoom(bounds, false, L.point(padding));
    }

    let observedSize = null;
    new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        const size = `${Math.round(width)}x${Math.round(height)}`;
        if (size === observedSize) return;
        const firstRun = observedSize === null;
        observedSize = size;
        const atBase = Math.abs(map.getZoom() - map.getMinZoom()) < 0.05;
        map.invalidateSize();
        if (firstRun || atBase) {
            fitAndLockMinZoom();
            return;
        }
        map.setMinZoom(Math.min(baseFitZoom(), map.getZoom()));
    }).observe(document.getElementById('map'));

    const statusBar = startStatusBar(strings, settings.language);

    const regionStatusLayer = addRegionStatusLayer(map, strings, settings.language);
    const occupiedTerritoryLayer = addOccupiedTerritoryLayer(map);
    const threatsLayer = startNeptunLayer(map, strings, settings.language, statusBar.setThreatCount, mapRevealedPromise);
    const riverLayer = SATELLITE_BASEMAP ? L.layerGroup() : addRiversLayer(map);
    const labelsLayer = addLabelsLayer(map, strings, settings.language);

    const layersControl = L.control
        .layers(null, {
            [strings.liveMapLayerAlertStatus]: regionStatusLayer,
            [strings.liveMapLayerOccupiedTerritory]: occupiedTerritoryLayer,
            [strings.liveMapLayerThreats]: threatsLayer,
            ...(SATELLITE_BASEMAP ? {} : { [strings.liveMapLayerRiver]: riverLayer }),
            [strings.liveMapLayerLabels]: labelsLayer,
            [strings.liveMapLegendTitle]: threatsLayer.legendLayer,
            [strings.liveMapHintTitle]: threatsLayer.hintLayer,
        })
        .addTo(map);

    if (window.alertServerLiveMap.onMapReady) {
        window.alertServerLiveMap.onMapReady({
            map,
            layers: {
                alerts: regionStatusLayer,
                occupied: occupiedTerritoryLayer,
                threats: threatsLayer,
                rivers: riverLayer,
                labels: labelsLayer,
                legend: threatsLayer.legendLayer,
                hints: threatsLayer.hintLayer,
            },
            applyKyivMode,
            layersControl,
        });
    }

    const initialRevealToken = sceneToken;
    const awaitingContainer = map.getContainer();
    const dataGate = L.DomUtil.create('div', 'data-gate', awaitingContainer);
    L.DomUtil.create('div', 'data-gate-text', dataGate).textContent = strings.liveMapAwaitingData;
    awaitingContainer.classList.add('awaiting-data');
    const awaitingOutline = L.polygon(UKRAINE_OUTLINE, {
        interactive: false,
        className: 'awaiting-outline',
        fillColor: isDarkMap ? '#243345' : '#d3ccbb',
        fillOpacity: 1,
        color: isDarkMap ? '#3f5470' : '#a29882',
        weight: 3,
        lineJoin: 'round',
    }).addTo(map);

    const isDataLoaded = window.alertServerLiveMap.isDataLoaded;
    let dataLoadFailures = 0;
    while (isDataLoaded) {
        try {
            if (await isDataLoaded()) break;
            dataLoadFailures = 0;
        } catch (err) {
            dataLoadFailures += 1;
            if (dataLoadFailures >= DATA_LOAD_MAX_FAILURES) break;
        }
        await sleep(1000);
    }
    await Promise.all([refreshAlertedRegions(), statusBar.refreshAlertCount()]);

    await Promise.all([
        waitForSceneReady(kyivModeActive),
        alertedRegionsReady,
        Promise.race([occupiedTerritoryLayer.ready, sleep(OCCUPIED_WAIT_MS)]),
    ]);
    map.removeLayer(awaitingOutline);
    dataGate.remove();
    awaitingContainer.classList.remove('awaiting-data');
    await sleep(50);

    if (sceneToken === initialRevealToken) {
        map.getContainer().classList.remove('map-transitioning');
        fadeIn(baseMapOverlay.getElement());
    }
    resolveMapRevealed();

    if (forceKyivMode && !kyivModeActive) applyKyivMode(true);

    const pendingFocus = await window.alertServerLiveMap.consumePendingFocusRegion();
    if (pendingFocus) focusRegion(pendingFocus);
}

main();

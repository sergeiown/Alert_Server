// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('node:path');
const { buildSync } = require('esbuild');

const OUT = path.join(__dirname, '..', 'electron-app', 'src', 'renderer', 'liveMap', 'vendor', 'osm-basemap.js');

buildSync({
    entryPoints: [path.join(__dirname, 'osm-basemap.entry.js')],
    outfile: OUT,
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'chrome120',
    legalComments: 'none',
    banner: { js: '/* protomaps-leaflet (BSD-3-Clause) and @protomaps/basemaps (BSD-3-Clause), bundled by web-map/build-osm-vendor.js */' },
});

console.log('osm-basemap.js готово');

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('node:fs');
const path = require('node:path');

const BORDERS_FILE = path.join(__dirname, '..', 'electron-app', 'src', 'renderer', 'liveMap', 'oblastBorders.js');

const BOUNDS = { north: 52.380834, south: 44.387017, west: 22.138577, east: 40.220623 };
const WIDTH = 1224;
const HEIGHT = 816;

function loadBorders() {
    const source = fs.readFileSync(BORDERS_FILE, 'utf-8').replace('export { OBLAST_BORDERS };', 'module.exports = { OBLAST_BORDERS };');
    const module_ = { exports: {} };
    new Function('module', source)(module_);
    return module_.exports.OBLAST_BORDERS;
}

const mercatorY = (latDegrees) => Math.log(Math.tan(Math.PI / 4 + (latDegrees * Math.PI) / 360));
const NORTH_Y = mercatorY(BOUNDS.north);
const SOUTH_Y = mercatorY(BOUNDS.south);

function project([lat, lng]) {
    const x = ((lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * WIDTH;
    const y = ((NORTH_Y - mercatorY(lat)) / (NORTH_Y - SOUTH_Y)) * HEIGHT;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
}

function ringToPath(ring) {
    return `M${ring.map(project).join('L')}Z`;
}

const borders = loadBorders();
const paths = Object.entries(borders)
    .map(([name, rings]) => `<path fill-rule="evenodd" d="${rings.map(ringToPath).join('')}"><title>${name}</title></path>`)
    .join('\n');

const THEMES = {
    light: { fill: '#d9d3c1', stroke: '#9a9481' },
    dark: { fill: '#333a42', stroke: '#4d5560' },
};

Object.entries(THEMES).forEach(([theme, colors]) => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
<style>
path { fill: ${colors.fill}; stroke: ${colors.stroke}; stroke-width: 0.9; stroke-linejoin: round; }
</style>
${paths}
</svg>
`;
    fs.writeFileSync(path.join(__dirname, `basemap-${theme}.svg`), svg);
    console.log(`basemap-${theme}.svg: ${Object.keys(borders).length} областей, ${(svg.length / 1024).toFixed(0)} КБ`);
});

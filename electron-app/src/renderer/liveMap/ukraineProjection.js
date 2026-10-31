const GEO = { west: 22.1372, east: 40.2272, north: 52.3738, south: 44.3877 };
const BOX = { left: 0.2519, right: 612.212, top: 0.4824, bottom: 407.762 };

const mercatorY = (latitude) => Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
const NORTH_Y = mercatorY(GEO.north);
const SOUTH_Y = mercatorY(GEO.south);

function projectToSvg([latitude, longitude]) {
    const x = BOX.left + ((longitude - GEO.west) / (GEO.east - GEO.west)) * (BOX.right - BOX.left);
    const y = BOX.top + ((NORTH_Y - mercatorY(latitude)) / (NORTH_Y - SOUTH_Y)) * (BOX.bottom - BOX.top);
    return [x, y];
}

function ringToSvgPath(ring) {
    return `M${ring.map((point) => projectToSvg(point).map((value) => value.toFixed(1)).join(',')).join('L')}Z`;
}

export { projectToSvg, ringToSvgPath };

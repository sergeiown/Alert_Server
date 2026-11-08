# Copyright (c) 2024-2026 Serhii I. Myshko
# Licensed under the MIT License. See LICENSE for details.

import json
import math
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import write

BASE = 'https://tiles.versatiles.org/tiles'
BBOX = (21.0, 43.4, 41.0, 53.0)
WORKERS = 3
RETRIES = 6
USER_AGENT = 'AlertServer-landcover-extract/1.0 (github.com/sergeiown/Alert_Server)'


def tile_x(lon, zoom):
    return int((lon + 180.0) / 360.0 * (1 << zoom))


def tile_y(lat, zoom):
    radians = math.radians(lat)
    return int((1.0 - math.asinh(math.tan(radians)) / math.pi) / 2.0 * (1 << zoom))


def tiles_for(bbox, max_zoom):
    west, south, east, north = bbox
    result = []
    for zoom in range(max_zoom + 1):
        limit = (1 << zoom) - 1
        x0, x1 = max(0, tile_x(west, zoom)), min(limit, tile_x(east, zoom))
        y0, y1 = max(0, tile_y(north, zoom)), min(limit, tile_y(south, zoom))
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                result.append((zoom, x, y))
    return result


def fetch(job):
    source, tile = job
    zoom, x, y = tile
    url = f'{source}/{zoom}/{x}/{y}'
    for attempt in range(RETRIES):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity'})
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.headers.get('Content-Encoding'):
                    raise RuntimeError('unexpected content encoding')
                return tile, response.read()
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return tile, b''
            wait = int(err.headers.get('Retry-After') or 0) or 2 ** attempt
            time.sleep(min(wait, 60))
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 ** attempt)
    raise RuntimeError(f'failed: {url}')


def main(tileset, max_zoom, output):
    source = f'{BASE}/{tileset}'
    meta = json.load(urllib.request.urlopen(urllib.request.Request(f'{source}/tiles.json', headers={'User-Agent': USER_AGENT}), timeout=30))
    tiles = tiles_for(BBOX, max_zoom)
    print(f'{len(tiles)} tiles', flush=True)

    fetched = {}
    started = time.time()
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for index, (tile, data) in enumerate(pool.map(fetch, [(source, tile) for tile in tiles]), start=1):
            if data:
                fetched[tile] = data
            if index % 500 == 0:
                print(f'{index}/{len(tiles)} in {int(time.time() - started)} s', flush=True)

    ordered = sorted(fetched.items(), key=lambda item: zxy_to_tileid(*item[0]))
    west, south, east, north = BBOX
    with write(output) as writer:
        for tile, data in ordered:
            writer.write_tile(zxy_to_tileid(*tile), data)
        writer.finalize(
            {
                'tile_type': TileType.MVT,
                'tile_compression': Compression.NONE,
                'min_zoom': 0,
                'max_zoom': max_zoom,
                'min_lon_e7': int(west * 1e7),
                'min_lat_e7': int(south * 1e7),
                'max_lon_e7': int(east * 1e7),
                'max_lat_e7': int(north * 1e7),
                'center_zoom': 6,
                'center_lon_e7': int(31.2 * 1e7),
                'center_lat_e7': int(48.6 * 1e7),
            },
            {
                'name': f'Ukraine extract of VersaTiles {tileset}',
                'attribution': meta.get('attribution', ''),
                'description': meta.get('description', ''),
                'vector_layers': meta.get('vector_layers', []),
            },
        )
    print(f'{len(fetched)} non-empty tiles written to {output}', flush=True)


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]), sys.argv[3])

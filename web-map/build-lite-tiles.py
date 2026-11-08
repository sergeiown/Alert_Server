# Copyright (c) 2024-2026 Serhii I. Myshko
# Licensed under the MIT License. See LICENSE for details.

import gzip, json, sys, time
from pmtiles.reader import Reader, MmapSource, all_tiles
from pmtiles.tile import zxy_to_tileid, TileType, Compression
from pmtiles.writer import write

SRC, DST = sys.argv[1], sys.argv[2]
DROP = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else {'landuse', 'pois', 'boundaries', 'earth'}


def varint(buf, i):
    shift = result = 0
    while True:
        b = buf[i]
        i += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, i
        shift += 7


def layer_name(chunk):
    i = 0
    while i < len(chunk):
        key, i = varint(chunk, i)
        field, wire = key >> 3, key & 7
        if wire == 0:
            _, i = varint(chunk, i)
        elif wire == 2:
            length, i = varint(chunk, i)
            if field == 1:
                return chunk[i:i + length].decode('utf8')
            i += length
        elif wire == 1:
            i += 8
        elif wire == 5:
            i += 4
        else:
            raise ValueError('wire')
    return ''


def strip(data):
    out = bytearray()
    i = 0
    while i < len(data):
        start = i
        key, i = varint(data, i)
        field, wire = key >> 3, key & 7
        if wire == 2:
            length, i = varint(data, i)
            end = i + length
            if field == 3 and layer_name(data[i:end]) in DROP:
                i = end
                continue
            i = end
        elif wire == 0:
            _, i = varint(data, i)
        elif wire == 1:
            i += 8
        elif wire == 5:
            i += 4
        else:
            raise ValueError('wire')
        out += data[start:i]
    return bytes(out)


t0 = time.time()
with open(SRC, 'rb') as f:
    reader = Reader(MmapSource(f))
    header = reader.header()
    meta = reader.metadata()
    comp = header['tile_compression']
    meta['vector_layers'] = [l for l in meta.get('vector_layers', []) if l.get('id') not in DROP]
    print('tile compression', comp, 'dropping', sorted(DROP), 'kept layers', [l['id'] for l in meta['vector_layers']])
    before = after = n = 0
    with write(DST) as writer:
        for (z, x, y), data in all_tiles(MmapSource(f)):
            raw = gzip.decompress(data) if comp == Compression.GZIP else data
            slim = strip(raw)
            out = gzip.compress(slim, 9) if comp == Compression.GZIP else slim
            before += len(data)
            after += len(out)
            n += 1
            if len(slim):
                writer.write_tile(zxy_to_tileid(z, x, y), out)
            if n % 5000 == 0:
                print(n, 'tiles', round(before / 1048576), 'MB ->', round(after / 1048576), 'MB', round(time.time() - t0), 's', flush=True)
        new_header = {
            'tile_type': header['tile_type'],
            'tile_compression': comp,
            'min_zoom': header['min_zoom'],
            'max_zoom': header['max_zoom'],
            'min_lon_e7': header['min_lon_e7'],
            'min_lat_e7': header['min_lat_e7'],
            'max_lon_e7': header['max_lon_e7'],
            'max_lat_e7': header['max_lat_e7'],
            'center_zoom': header['center_zoom'],
            'center_lon_e7': header['center_lon_e7'],
            'center_lat_e7': header['center_lat_e7'],
        }
        writer.finalize(new_header, meta)
print('done', n, 'tiles', round(before / 1048576), 'MB ->', round(after / 1048576), 'MB', round(time.time() - t0), 's')

# Copyright (c) 2024-2026 Serhii I. Myshko
# Licensed under the MIT License. See LICENSE for details.

import gzip, json, struct, sys, time
from pmtiles.reader import Reader, MmapSource, all_tiles
from pmtiles.tile import zxy_to_tileid, Compression
from pmtiles.writer import write

SRC, DST = sys.argv[1], sys.argv[2]
INSPECT = len(sys.argv) > 3 and sys.argv[3] == '--inspect'
ALWAYS_KEEP = {'city', 'town'}
PER_TILE_LIMIT = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 6, 11: 9, 12: 14}


def varint(buf, i):
    shift = result = 0
    while True:
        b = buf[i]
        i += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, i
        shift += 7


def put_varint(value):
    out = bytearray()
    while True:
        b = value & 0x7F
        value >>= 7
        if value:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def fields(buf):
    i = 0
    while i < len(buf):
        key, i = varint(buf, i)
        field, wire = key >> 3, key & 7
        if wire == 0:
            value, i = varint(buf, i)
            yield field, wire, value, None
        elif wire == 2:
            length, i = varint(buf, i)
            yield field, wire, buf[i:i + length], None
            i += length
        elif wire == 1:
            yield field, wire, buf[i:i + 8], None
            i += 8
        elif wire == 5:
            yield field, wire, buf[i:i + 4], None
            i += 4
        else:
            raise ValueError('wire')


def decode_value(buf):
    for field, wire, value, _ in fields(buf):
        if field == 1:
            return value.decode('utf8')
        if field == 2:
            return struct.unpack('<f', value)[0]
        if field == 3:
            return struct.unpack('<d', value)[0]
        if field in (4, 5):
            return value
        if field == 6:
            return (value >> 1) ^ -(value & 1)
        if field == 7:
            return bool(value)
    return None


def parse_layer(chunk):
    name = ''
    keys, values, features, extra = [], [], [], []
    for field, wire, value, _ in fields(chunk):
        if field == 1:
            name = value.decode('utf8')
        elif field == 2:
            features.append(value)
        elif field == 3:
            keys.append(value.decode('utf8'))
        elif field == 4:
            values.append(decode_value(value))
        else:
            extra.append((field, wire, value))
    return name, keys, values, features, extra


def feature_props(feature, keys, values):
    tags = []
    for field, wire, value, _ in fields(feature):
        if field == 2 and wire == 2:
            j = 0
            while j < len(value):
                n, j = varint(value, j)
                tags.append(n)
    props = {}
    for k in range(0, len(tags) - 1, 2):
        props[keys[tags[k]]] = values[tags[k + 1]]
    return props


def rank_of(props):
    population = props.get('population')
    if not isinstance(population, (int, float)):
        population = 0
    return (-float(population), float(props.get('min_zoom') or 99))


def rebuild_layer(name, keys, values, features, extra, raw_values_chunk):
    out = bytearray()
    out += put_varint((1 << 3) | 2) + put_varint(len(name.encode())) + name.encode()
    for feature in features:
        out += put_varint((2 << 3) | 2) + put_varint(len(feature)) + feature
    for key in keys:
        encoded = key.encode()
        out += put_varint((3 << 3) | 2) + put_varint(len(encoded)) + encoded
    for chunk in raw_values_chunk:
        out += put_varint((4 << 3) | 2) + put_varint(len(chunk)) + chunk
    for field, wire, value in extra:
        if wire == 0:
            out += put_varint((field << 3) | 0) + put_varint(value)
        elif wire == 2:
            out += put_varint((field << 3) | 2) + put_varint(len(value)) + value
    return bytes(out)


def raw_value_chunks(chunk):
    result = []
    for field, wire, value, _ in fields(chunk):
        if field == 4:
            result.append(value)
    return result


def thin_tile(data, zoom):
    out = bytearray()
    kept = dropped = 0
    for field, wire, value, _ in fields(data):
        if field == 3 and wire == 2:
            name, keys, values, features, extra = parse_layer(value)
            if name != 'places':
                continue
            limit = PER_TILE_LIMIT.get(zoom, 14)
            major, rest = [], []
            for feature in features:
                props = feature_props(feature, keys, values)
                if props.get('kind_detail') in ALWAYS_KEEP:
                    major.append(feature)
                elif props.get('kind') == 'locality' and not props.get('name'):
                    continue
                else:
                    rest.append((rank_of(props), feature))
            rest.sort(key=lambda item: item[0])
            chosen = major + [feature for _, feature in rest[:limit]]
            kept += len(chosen)
            dropped += len(features) - len(chosen)
            layer = rebuild_layer(name, keys, values, chosen, extra, raw_value_chunks(value))
            out += put_varint((3 << 3) | 2) + put_varint(len(layer)) + layer
    return bytes(out), kept, dropped


t0 = time.time()
with open(SRC, 'rb') as f:
    reader = Reader(MmapSource(f))
    header = reader.header()
    meta = reader.metadata()
    comp = header['tile_compression']
    meta['vector_layers'] = [l for l in meta.get('vector_layers', []) if l.get('id') == 'places']
    before = after = n = kept_total = dropped_total = 0
    if INSPECT:
        shown = 0
        for (z, x, y), data in all_tiles(MmapSource(f)):
            if z != 11:
                continue
            raw = gzip.decompress(data) if comp == Compression.GZIP else data
            for field, wire, value, _ in fields(raw):
                if field == 3 and wire == 2:
                    name, keys, values, features, extra = parse_layer(value)
                    if name == 'places' and len(features) > 5:
                        for feature in features[:6]:
                            print(z, x, y, feature_props(feature, keys, values))
                        print('total features in tile', len(features))
                        shown += 1
            if shown >= 2:
                break
        sys.exit(0)
    with write(DST) as writer:
        for (z, x, y), data in all_tiles(MmapSource(f)):
            raw = gzip.decompress(data) if comp == Compression.GZIP else data
            slim, kept, dropped = thin_tile(raw, z)
            kept_total += kept
            dropped_total += dropped
            before += len(data)
            n += 1
            if kept:
                out = gzip.compress(slim, 9) if comp == Compression.GZIP else slim
                after += len(out)
                writer.write_tile(zxy_to_tileid(z, x, y), out)
            if n % 5000 == 0:
                print(n, 'tiles', round(time.time() - t0), 's', 'kept', kept_total, 'dropped', dropped_total, flush=True)
        new_header = {k: header[k] for k in ('tile_type', 'tile_compression', 'min_zoom', 'max_zoom', 'min_lon_e7', 'min_lat_e7', 'max_lon_e7', 'max_lat_e7', 'center_zoom', 'center_lon_e7', 'center_lat_e7')}
        writer.finalize(new_header, meta)
print('done', n, 'tiles', round(before / 1048576), 'MB ->', round(after / 1048576), 'MB', 'kept', kept_total, 'dropped', dropped_total, round(time.time() - t0), 's')

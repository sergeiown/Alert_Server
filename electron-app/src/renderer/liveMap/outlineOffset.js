// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const COS_LAT = Math.cos((48.5 * Math.PI) / 180);

function metersPerPixel(zoom) {
    return (156543.03392 * COS_LAT) / 2 ** zoom;
}

export { metersPerPixel };

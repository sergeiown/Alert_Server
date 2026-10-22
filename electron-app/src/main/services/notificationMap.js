// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { BrowserWindow, nativeTheme } = require('electron');
const { getResourcePath, getUserDataFile } = require('./appPaths');

const REGION_TO_ISO = {
    4: ['UA-05'],
    8: ['UA-07'],
    9: ['UA-12'],
    28: ['UA-14'],
    10: ['UA-18'],
    11: ['UA-21'],
    12: ['UA-23'],
    13: ['UA-26'],
    14: ['UA-32'],
    15: ['UA-35'],
    16: ['UA-09'],
    27: ['UA-46'],
    31: ['UA-30'],
    17: ['UA-48'],
    18: ['UA-51'],
    19: ['UA-53'],
    5: ['UA-56'],
    20: ['UA-59'],
    21: ['UA-61'],
    22: ['UA-63'],
    23: ['UA-65'],
    3: ['UA-68'],
    24: ['UA-71'],
    26: ['UA-77'],
    25: ['UA-74'],
    29: ['UA-43', 'UA-40'],
};

const OUTPUT_WIDTH = 480;
const OUTPUT_HEIGHT = 238;
const TOP_PAD = 20;
const BOTTOM_PAD = 4;
const MAP_HEIGHT = OUTPUT_HEIGHT - TOP_PAD - BOTTOM_PAD;
const FILE_PREFIX = 'notification-map-';
const MAX_FILE_AGE_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 200;
const MIN_TRANSPARENT_SHARE = 0.3;
const MIN_HIGHLIGHT_PIXELS = 6;
const COLOR_TOLERANCE = 40;

let svgTemplate = null;
let renderCounter = 0;
let queue = Promise.resolve();

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
    return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function parseSize(svgText) {
    const match = svgText.match(/width="([\d.]+)"\s+height="([\d.]+)"/);
    if (!match) return { width: 612, height: 408 };
    return { width: Number(match[1]), height: Number(match[2]) };
}

function loadSvgTemplate() {
    if (svgTemplate === null) {
        const raw = fs.readFileSync(getResourcePath('icons', 'ukraine_default.svg'), 'utf-8');
        const stripped = raw.replace(/<style>[\s\S]*?<\/style>/, '');
        const { width, height } = parseSize(stripped);
        svgTemplate = /viewBox=/.test(stripped)
            ? stripped
            : stripped.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
    }
    return svgTemplate;
}

function hexToRgb(color) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(color || ''));
    if (!match) return null;
    const value = parseInt(match[1], 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupOldFiles() {
    const dir = path.dirname(getUserDataFile('x'));
    fs.readdir(dir, (err, names) => {
        if (err) return;
        const now = Date.now();
        names
            .filter((name) => name.startsWith(FILE_PREFIX))
            .forEach((name) => {
                const full = path.join(dir, name);
                fs.stat(full, (statErr, stat) => {
                    if (!statErr && now - stat.mtimeMs > MAX_FILE_AGE_MS) fs.unlink(full, () => {});
                });
            });
    });
}

async function captureOn(win, background) {
    await win.webContents.executeJavaScript(
        `document.documentElement.style.background='${background}';document.body.style.background='${background}';` +
            'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
    );
    await win.webContents.capturePage();
    await sleep(40);
    const image = await win.webContents.capturePage();
    const size = image.getSize();
    return { size, bitmap: image.toBitmap() };
}

function matte(white, black, size, highlight) {
    const count = size.width * size.height;
    const out = Buffer.alloc(count * 4);
    let transparent = 0;
    let highlightPixels = 0;

    for (let i = 0; i < count; i++) {
        const o = i * 4;
        const diff = (white.bitmap[o] - black.bitmap[o] + (white.bitmap[o + 1] - black.bitmap[o + 1]) + (white.bitmap[o + 2] - black.bitmap[o + 2])) / 3;
        const alpha = Math.min(1, Math.max(0, 1 - diff / 255));
        if (alpha < 0.5) transparent++;
        if (alpha <= 0.002) continue;

        const b = Math.min(255, Math.round(black.bitmap[o] / alpha));
        const g = Math.min(255, Math.round(black.bitmap[o + 1] / alpha));
        const r = Math.min(255, Math.round(black.bitmap[o + 2] / alpha));
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = b;
        out[o + 3] = Math.round(alpha * 255);

        if (
            highlight &&
            alpha > 0.9 &&
            Math.abs(r - highlight.r) <= COLOR_TOLERANCE &&
            Math.abs(g - highlight.g) <= COLOR_TOLERANCE &&
            Math.abs(b - highlight.b) <= COLOR_TOLERANCE
        ) {
            highlightPixels++;
        }
    }

    return { rgba: out, transparentShare: transparent / count, highlightPixels };
}

function buildHtml(stateIsoCodes, color) {
    const svgText = loadSvgTemplate();
    const { width: svgWidth, height: svgHeight } = parseSize(svgText);
    const scale = Math.min(OUTPUT_WIDTH / svgWidth, MAP_HEIGHT / svgHeight);
    const renderedWidth = Math.round(svgWidth * scale);
    const renderedHeight = Math.round(svgHeight * scale);
    const highlightCss = stateIsoCodes.map((iso) => `#${iso}{fill:${color};}`).join('');
    const isDark = nativeTheme.shouldUseDarkColors;
    const regionFill = isDark ? 'rgba(255,255,255,0.17)' : 'rgba(0,0,0,0.13)';
    const regionStroke = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.8)';

    return `<!doctype html><html><head><style>
        html,body{margin:0;padding:0;width:${OUTPUT_WIDTH}px;height:${OUTPUT_HEIGHT}px;background:#000;
            display:flex;align-items:center;justify-content:center;overflow:hidden;}
        body{padding-top:${TOP_PAD}px;padding-bottom:${BOTTOM_PAD}px;box-sizing:border-box;}
        svg{width:${renderedWidth}px;height:${renderedHeight}px;display:block;}
        path{fill:${regionFill};stroke:${regionStroke};stroke-width:0.5;transition:none;}
        ${highlightCss}
    </style></head><body>${svgText}</body></html>`;
}

async function renderOnce(isoCodes, color, outputPath, htmlPath) {
    const win = new BrowserWindow({
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        show: false,
        frame: false,
        webPreferences: { sandbox: true, backgroundThrottling: false },
    });

    try {
        fs.writeFileSync(htmlPath, buildHtml(isoCodes, color), 'utf-8');
        await win.loadFile(htmlPath);
        const black = await captureOn(win, '#000');
        const white = await captureOn(win, '#fff');
        if (black.size.width !== white.size.width || black.size.height !== white.size.height) {
            throw new Error('Notification map capture sizes differ');
        }
        const result = matte(white, black, black.size, hexToRgb(color));
        if (result.transparentShare < MIN_TRANSPARENT_SHARE || result.highlightPixels < MIN_HIGHLIGHT_PIXELS) {
            throw new Error('Notification map render is empty');
        }
        fs.writeFileSync(outputPath, encodePng(black.size.width, black.size.height, result.rgba));
        return outputPath;
    } finally {
        win.destroy();
        fs.unlink(htmlPath, () => {});
    }
}

async function renderNow(stateUids, color) {
    const isoCodes = stateUids.flatMap((uid) => REGION_TO_ISO[uid] || []);
    if (!isoCodes.length) return null;

    cleanupOldFiles();
    renderCounter += 1;
    const token = `${Date.now()}-${renderCounter}`;
    const htmlPath = getUserDataFile(`${FILE_PREFIX}render-${token}.html`);
    const outputPath = getUserDataFile(`${FILE_PREFIX}${token}.png`);

    let lastError = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            return await renderOnce(isoCodes, color, outputPath, htmlPath);
        } catch (err) {
            lastError = err;
            await sleep(RETRY_PAUSE_MS * (attempt + 1));
        }
    }
    throw lastError;
}

function renderRegionMapImage(stateUidOrUids, color) {
    const stateUids = Array.isArray(stateUidOrUids) ? stateUidOrUids : [stateUidOrUids];
    const result = queue.then(
        () => renderNow(stateUids, color),
        () => renderNow(stateUids, color)
    );
    queue = result.catch(() => {});
    return result;
}

cleanupOldFiles();

module.exports = { renderRegionMapImage };

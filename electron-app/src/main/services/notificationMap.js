const fs = require('fs');
const { BrowserWindow } = require('electron');
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

const IMAGE_WIDTH = 480;

let svgTemplate = null;
let renderCounter = 0;
let queue = Promise.resolve();

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

async function renderNow(stateUid, color) {
    const isoCodes = REGION_TO_ISO[stateUid];
    if (!isoCodes) return null;

    const svgText = loadSvgTemplate();
    const { width, height } = parseSize(svgText);
    const imageHeight = Math.round(IMAGE_WIDTH * (height / width));
    const highlightCss = isoCodes.map((iso) => `#${iso}{fill:${color};}`).join('');

    const html = `<!doctype html><html><head><style>
        html,body{margin:0;padding:0;background:#f4f4f4;}
        svg{width:${IMAGE_WIDTH}px;height:${imageHeight}px;display:block;}
        path{fill:#c9d0d8;stroke:#f4f4f4;stroke-width:0.5;}
        ${highlightCss}
    </style></head><body>${svgText}</body></html>`;

    renderCounter = (renderCounter + 1) % 2;
    const htmlPath = getUserDataFile(`notification-map-render-${renderCounter}.html`);
    const outputPath = getUserDataFile(`notification-map-${renderCounter}.png`);

    const win = new BrowserWindow({
        width: IMAGE_WIDTH,
        height: imageHeight,
        show: false,
        frame: false,
        webPreferences: { sandbox: true },
    });

    try {
        fs.writeFileSync(htmlPath, html, 'utf-8');
        await win.loadFile(htmlPath);
        const image = await win.webContents.capturePage();
        fs.writeFileSync(outputPath, image.toPNG());
        return outputPath;
    } finally {
        win.destroy();
        fs.unlink(htmlPath, () => {});
    }
}

function renderRegionMapImage(stateUid, color) {
    const result = queue.then(
        () => renderNow(stateUid, color),
        () => renderNow(stateUid, color)
    );
    queue = result.catch(() => {});
    return result;
}

module.exports = { renderRegionMapImage };

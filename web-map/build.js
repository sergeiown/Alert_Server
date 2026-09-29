// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'electron-app', 'src', 'renderer', 'liveMap');
const LEAFLET = path.join(ROOT, 'electron-app', 'node_modules', 'leaflet', 'dist');
const I18N = path.join(ROOT, 'electron-app', 'src', 'i18n');
const RESOURCES = path.join(ROOT, 'electron-app', 'resources');
const OUT = path.join(__dirname, 'dist');

function copyFile(from, to) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

function copyDirectory(from, to, filter) {
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from, { withFileTypes: true }).forEach((entry) => {
        const source = path.join(from, entry.name);
        const target = path.join(to, entry.name);
        if (entry.isDirectory()) copyDirectory(source, target, filter);
        else if (!filter || filter(entry.name)) copyFile(source, target);
    });
}

function prefixRules(block, prefix) {
    return block.replace(/([^{}]+)\{([^{}]*)\}/g, (match, selectors, declarations) => {
        const rewritten = selectors
            .split(',')
            .map((selector) => selector.trim())
            .filter(Boolean)
            .map((selector) => (selector.startsWith(':root') ? prefix + selector.slice(5) : `${prefix} ${selector}`))
            .join(',\n');
        return `${rewritten} {${declarations}}`;
    });
}

function forceableDarkTheme(css) {
    const marker = '@media (prefers-color-scheme: dark)';
    let output = '';
    let index = 0;

    for (;;) {
        const at = css.indexOf(marker, index);
        if (at === -1) {
            output += css.slice(index);
            return output;
        }

        output += css.slice(index, at);
        const open = css.indexOf('{', at);
        let depth = 1;
        let cursor = open + 1;
        while (depth > 0) {
            const char = css[cursor++];
            if (char === '{') depth++;
            else if (char === '}') depth--;
        }

        const inner = css.slice(open + 1, cursor - 1);
        if (/@/.test(inner)) throw new Error('nested at-rule inside a dark media block is not supported');
        output += `${marker} {${prefixRules(inner, ':root:not([data-theme="light"])')}}\n${prefixRules(inner, ':root[data-theme="dark"]')}`;
        index = cursor;
    }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

copyDirectory(RENDERER, OUT, (name) => name !== 'index.html');
copyDirectory(LEAFLET, path.join(OUT, 'vendor', 'leaflet'), (name) => /^(leaflet\.css|leaflet\.js)$/.test(name) || /\.png$/.test(name));

['en', 'uk'].forEach((code) => copyFile(path.join(I18N, `${code}.json`), path.join(OUT, 'i18n', `${code}.json`)));
copyFile(path.join(RESOURCES, 'data', 'alertTypes.json'), path.join(OUT, 'data', 'alertTypes.json'));
copyFile(path.join(RESOURCES, 'icons', 'app-icon-256.png'), path.join(OUT, 'icon-256.png'));

['index.html', 'shim.js', 'web.js', 'web.css', 'manifest.webmanifest', 'basemap-light.svg', 'basemap-dark.svg'].forEach((name) =>
    copyFile(path.join(__dirname, name), path.join(OUT, name))
);

const cssFile = path.join(OUT, 'index.css');
fs.writeFileSync(cssFile, forceableDarkTheme(fs.readFileSync(cssFile, 'utf-8')));

const forbidden = ['mapsvg'];
const offenders = [];
(function scan(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return scan(full);
        if (!/\.(js|html|css|svg|json|webmanifest)$/.test(entry.name)) return;
        const content = fs.readFileSync(full, 'utf-8');
        forbidden.forEach((needle) => {
            if (content.includes(needle) && entry.name !== 'index.js') offenders.push(`${path.relative(OUT, full)}: ${needle}`);
        });
    });
})(OUT);

const totalBytes = (function size(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
        const full = path.join(directory, entry.name);
        return sum + (entry.isDirectory() ? size(full) : fs.statSync(full).size);
    }, 0);
})(OUT);

console.log(`web-map/dist зібрано: ${(totalBytes / 1024).toFixed(0)} КБ`);
if (offenders.length) {
    console.error('Знайдено заборонені посилання:\n' + offenders.join('\n'));
    process.exit(1);
}

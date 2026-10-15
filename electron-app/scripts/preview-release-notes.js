// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { extractHighlights } = require('../src/main/services/releaseHighlights');

const MAX_ITEMS = 5;
const MAX_LENGTH = 150;

function readBody() {
    const args = process.argv.slice(2);
    const tagIndex = args.indexOf('--tag');
    if (tagIndex !== -1 && args[tagIndex + 1]) {
        return execFileSync('gh', ['release', 'view', args[tagIndex + 1], '--json', 'body', '--jq', '.body'], { encoding: 'utf8' });
    }
    const file = args.find((arg) => !arg.startsWith('--'));
    return fs.readFileSync(file || 0, 'utf8');
}

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function markdownToHtml(markdown) {
    const out = [];
    let inList = false;
    markdown.split(/\r?\n/).forEach((line) => {
        const item = line.match(/^\s*[-*]\s+(.*)$/);
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (item) {
            if (!inList) out.push('<ul>');
            inList = true;
            out.push(`<li>${escapeHtml(item[1])}</li>`);
            return;
        }
        if (inList) out.push('</ul>');
        inList = false;
        if (heading) out.push(`<h${heading[1].length}>${escapeHtml(heading[2])}</h${heading[1].length}>`);
        else if (line.trim()) out.push(`<p>${escapeHtml(line.trim())}</p>`);
    });
    if (inList) out.push('</ul>');
    return out.join('\n');
}

function countItems(html) {
    return (html.match(/<li[^>]*>/gi) || []).length;
}

function show(label, language, html) {
    const items = extractHighlights(html, language);
    console.log(`\n${label}`);
    if (!items.length) {
        console.log('  (блок "Що нового" не буде показано)');
        return;
    }
    items.forEach((text, index) => console.log(`  ${index + 1}. ${text}  [${text.length}]`));
}

const html = markdownToHtml(readBody());
const warnings = [];
const hasUkrainian = /<h[1-6][^>]*>[^<]*Українською[^<]*<\/h[1-6]>/i.test(html);
const split = html.search(/<h[1-6][^>]*>[^<]*Українською[^<]*<\/h[1-6]>/i);
const englishCount = countItems(split === -1 ? html : html.slice(0, split));
const ukrainianCount = hasUkrainian ? countItems(html.slice(split)) : 0;

if (!englishCount) warnings.push('Немає англійського списку змін.');
if (englishCount > MAX_ITEMS) warnings.push(`Англійських пунктів ${englishCount}, у вікні буде показано лише ${MAX_ITEMS}.`);
if (!hasUkrainian) warnings.push('Немає блоку "### Українською": українські користувачі побачать англійські пункти.');
if (hasUkrainian && ukrainianCount !== englishCount) warnings.push(`Різна кількість пунктів: англійських ${englishCount}, українських ${ukrainianCount}.`);
if (/<li[^>]*>[^<]{151,}<\/li>/.test(html)) warnings.push(`Є пункти довші за ${MAX_LENGTH} символів, їх буде обрізано.`);

show('Англійський інтерфейс:', 'English', html);
show('Український інтерфейс:', 'Ukrainian', html);

console.log('');
if (warnings.length) warnings.forEach((warning) => console.log(`! ${warning}`));
else console.log('Усе гаразд: обидві мови, кількість пунктів і довжина в межах.');

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const MAX_ITEMS = 5;
const MAX_LENGTH = 150;
const UKRAINIAN_HEADING = /<h[1-6][^>]*>[^<]*Українською[^<]*<\/h[1-6]>/i;

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

function decode(text) {
    return text.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (match) => ENTITIES[match] || match);
}

function listItems(html) {
    const items = [];
    const pattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let match = pattern.exec(html);
    while (match) {
        const text = decode(match[1].replace(/<[^>]+>/g, ' '))
            .replace(/\s+/g, ' ')
            .trim();
        if (text) items.push(text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…` : text);
        match = pattern.exec(html);
    }
    return items;
}

function notesToHtml(releaseNotes) {
    if (!releaseNotes) return '';
    if (Array.isArray(releaseNotes)) return releaseNotes.map((entry) => (entry && entry.note) || '').join('\n');
    return String(releaseNotes);
}

function extractHighlights(releaseNotes, language) {
    const html = notesToHtml(releaseNotes);
    if (!html) return [];

    const split = html.search(UKRAINIAN_HEADING);
    const english = split === -1 ? html : html.slice(0, split);
    const ukrainian = split === -1 ? '' : html.slice(split);

    const preferred = language === 'English' ? english : ukrainian || english;
    return listItems(preferred).slice(0, MAX_ITEMS);
}

module.exports = { extractHighlights };

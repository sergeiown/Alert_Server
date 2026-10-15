// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const api = window.alertServerUpdatePrompt;

async function main() {
    const [strings, info, icon] = await Promise.all([api.getStrings(), api.getInfo(), api.getIcon()]);
    const kind = info ? info.kind : 'normal';

    document.title = strings.appName;
    document.getElementById('icon').src = icon;
    document.getElementById('heading').textContent = kind === 'forced' ? strings.updatePromptHeadingForced : strings.updatePromptHeading;
    document.getElementById('message').textContent = strings.updatePromptMessage
        .replace('{version}', info ? info.version : '')
        .replace('{current}', info ? info.current : '');

    const note = document.getElementById('note');
    if (kind === 'mandatory') {
        note.textContent = strings.updatePromptMandatoryNote;
        note.hidden = false;
    } else if (kind === 'forced') {
        note.textContent = strings.updatePromptForcedNote;
        note.classList.add('forced');
        note.hidden = false;
    }

    const highlights = info && Array.isArray(info.highlights) ? info.highlights : [];
    if (highlights.length) {
        document.getElementById('highlightsTitle').textContent = strings.updatePromptWhatsNew;
        const list = document.getElementById('highlightsList');
        highlights.forEach((text) => {
            const item = document.createElement('li');
            item.textContent = text;
            list.appendChild(item);
        });
        document.getElementById('highlights').hidden = false;
    }

    document.getElementById('hint').textContent = strings.updatePromptHint;

    const installButton = document.getElementById('installButton');
    const laterButton = document.getElementById('laterButton');
    installButton.textContent = strings.updatePromptInstall;
    laterButton.textContent = strings.updatePromptLater;
    if (kind === 'forced') laterButton.hidden = true;

    installButton.addEventListener('click', () => api.choose('install'));
    laterButton.addEventListener('click', () => api.choose('later'));
    installButton.focus();

    requestAnimationFrame(() => api.fit(document.body.scrollHeight));
}

main();

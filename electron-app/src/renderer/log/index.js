// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const sizeLabel = document.getElementById('sizeLabel');
const clearButton = document.getElementById('clearButton');
const openNotepadButton = document.getElementById('openNotepadButton');
const openExcelButton = document.getElementById('openExcelButton');
const content = document.getElementById('content');

const AUTO_REFRESH_MS = 2000;
const KNOWN_LEVELS = ['INFO', 'WARNING', 'ERROR', 'NETWORK', 'ALERT'];

let strings = null;
let lastText = null;

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

function buildLines(text) {
    const lines = text.split(/\r?\n/);
    return lines.map((line, index) => {
        const span = document.createElement('span');
        const level = line.split(',')[2];
        span.className = KNOWN_LEVELS.includes(level) ? `line level-${level}` : 'line meta';
        span.textContent = index < lines.length - 1 ? `${line}\n` : line;
        return span;
    });
}

async function render() {
    const wasAtBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 4;

    const { content: text, size } = await window.alertServerLog.getContent();
    if (text === lastText) return;
    lastText = text;

    content.replaceChildren(...buildLines(text));
    sizeLabel.textContent = `${strings.logSizeLabel}: ${formatSize(size)}`;
    if (wasAtBottom) content.scrollTop = content.scrollHeight;
}

async function main() {
    strings = await window.alertServerLog.getStrings();
    document.title = strings.logWindowTitle;
    clearButton.textContent = strings.logClearButton;
    openNotepadButton.textContent = strings.logOpenInNotepadButton;
    openExcelButton.textContent = strings.logOpenInExcelButton;

    clearButton.addEventListener('click', async () => {
        await window.alertServerLog.clear();
        await render();
    });

    openNotepadButton.addEventListener('click', () => {
        window.alertServerLog.openInNotepad();
    });

    openExcelButton.addEventListener('click', () => {
        window.alertServerLog.openInExcel();
    });

    if (await window.alertServerLog.isExcelAvailable()) {
        openExcelButton.hidden = false;
    }

    await render();
    setInterval(render, AUTO_REFRESH_MS);
}

main();

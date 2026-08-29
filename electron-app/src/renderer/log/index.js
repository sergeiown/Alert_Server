// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const sizeLabel = document.getElementById('sizeLabel');
const clearButton = document.getElementById('clearButton');
const openNotepadButton = document.getElementById('openNotepadButton');
const openExcelButton = document.getElementById('openExcelButton');
const content = document.getElementById('content');

const AUTO_REFRESH_MS = 2000;

let strings = null;

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

async function render() {
    const wasAtBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 4;

    const { content: text, size } = await window.alertServerLog.getContent();
    if (text === content.textContent) return;

    content.textContent = text;
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

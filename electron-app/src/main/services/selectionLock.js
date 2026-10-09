// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const LOCK_CSS = `
*, *::before, *::after {
    -webkit-user-select: none !important;
    user-select: none !important;
    -webkit-user-drag: none !important;
}
input, textarea {
    -webkit-user-select: text !important;
    user-select: text !important;
}
`;

function lockSelection(webContents) {
    webContents.on('dom-ready', () => {
        webContents.insertCSS(LOCK_CSS).catch(() => {});
    });
}

module.exports = { lockSelection };

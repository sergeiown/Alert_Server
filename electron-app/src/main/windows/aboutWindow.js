// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { showHub } = require('./hubWindow');

function openAboutWindow() {
    return showHub('about');
}

module.exports = { openAboutWindow };

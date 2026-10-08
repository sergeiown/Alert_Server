// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { showHub } = require('./hubWindow');

function openTrendsWindow() {
    return showHub('trends');
}

module.exports = { openTrendsWindow };

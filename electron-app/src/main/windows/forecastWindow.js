// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { showHub, getView } = require('./hubWindow');

function openForecastWindow() {
    return showHub('forecast');
}

function notifyRegionsChanged() {
    const view = getView('forecast');
    if (view) view.webContents.send('regions:changed');
}

module.exports = { openForecastWindow, notifyRegionsChanged };

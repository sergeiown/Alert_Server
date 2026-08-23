// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { app } = require('electron');

function getUserDataFile(name) {
    return path.join(app.getPath('userData'), name);
}

function getResourcePath(...segments) {
    const base = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources');
    return path.join(base, ...segments);
}

module.exports = { getUserDataFile, getResourcePath };

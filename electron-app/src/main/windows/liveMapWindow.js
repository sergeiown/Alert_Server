// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { withView, getView, isViewShowing } = require('./hubWindow');

let pendingKyivMode = false;

function openLiveMapWindow() {
    return withView('liveMap');
}

function getLiveMapWindow() {
    return getView('liveMap');
}

function openLiveMapWindowInKyivMode() {
    const alreadyShowing = isViewShowing('liveMap');
    const view = withView('liveMap');

    if (!alreadyShowing || view.webContents.isLoading()) {
        pendingKyivMode = true;
    } else {
        view.webContents.send('liveMap:forceKyivMode');
    }

    return view;
}

function consumePendingKyivMode() {
    const value = pendingKyivMode;
    pendingKyivMode = false;
    return value;
}

module.exports = { openLiveMapWindow, getLiveMapWindow, openLiveMapWindowInKyivMode, consumePendingKyivMode };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('path');
const { app, BrowserWindow, WebContentsView, nativeTheme } = require('electron');
const settingsStore = require('../services/settingsStore');
const { logEvent } = require('../services/logger');
const { getResourcePath } = require('../services/appPaths');
const { lockSelection } = require('../services/selectionLock');

const HEADER_HEIGHT = 100;
const HISTORY_LIMIT = 30;

const preloadDir = path.join(__dirname, '..', '..', 'preload');
const rendererDir = path.join(__dirname, '..', '..', 'renderer');

const VIEWS = {
    status: { preload: 'statusPreload.js', page: 'status' },
    liveMap: { preload: 'liveMapPreload.js', page: 'liveMap' },
    forecast: { preload: 'forecastPreload.js', page: 'forecast' },
    trends: { preload: 'trendsPreload.js', page: 'trends' },
    settings: { preload: 'settingsPreload.js', page: 'settings' },
    log: { preload: 'logPreload.js', page: 'log' },
    about: { preload: 'aboutPreload.js', page: 'about' },
};

let hubWindow = null;
let currentView = 'home';
let isQuitting = false;
let htmlFullscreenView = null;
let fullscreenRequestedByPage = false;
let revealWhenReady = false;
let rememberedBounds = null;
let rememberedMaximized = false;
const history = [];
const views = new Map();

app.on('before-quit', () => {
    isQuitting = true;
});

function backgroundColor() {
    return nativeTheme.shouldUseDarkColors ? '#101720' : '#d5e1ee';
}

function layoutViews() {
    if (!hubWindow || hubWindow.isDestroyed()) return;
    const { width, height } = hubWindow.getContentBounds();
    views.forEach((view, name) => {
        const top = name === htmlFullscreenView ? 0 : HEADER_HEIGHT;
        view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
    });
}

function relayoutSoon() {
    layoutViews();
    [120, 450].forEach((delay) => setTimeout(layoutViews, delay));
}

function currentState() {
    return {
        view: currentView,
        canGoBack: history.length > 0,
        maximized: Boolean(hubWindow && !hubWindow.isDestroyed() && hubWindow.isMaximized()),
    };
}

function sendState() {
    if (hubWindow && !hubWindow.isDestroyed()) hubWindow.webContents.send('hub:state', currentState());
}

function ensureView(name) {
    if (views.has(name)) return views.get(name);

    const definition = VIEWS[name];
    const view = new WebContentsView({
        webPreferences: {
            preload: path.join(preloadDir, definition.preload),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });
    lockSelection(view.webContents);
    view.setBackgroundColor(backgroundColor());
    view.setVisible(false);
    hubWindow.contentView.addChildView(view);
    view.webContents.on('enter-html-full-screen', () => {
        htmlFullscreenView = name;
        if (!hubWindow.isFullScreen()) {
            fullscreenRequestedByPage = true;
            hubWindow.setFullScreen(true);
        }
        relayoutSoon();
    });
    view.webContents.on('leave-html-full-screen', () => {
        htmlFullscreenView = null;
        if (fullscreenRequestedByPage && hubWindow && !hubWindow.isDestroyed()) {
            fullscreenRequestedByPage = false;
            hubWindow.setFullScreen(false);
        }
        relayoutSoon();
    });
    view.webContents.loadFile(path.join(rendererDir, definition.page, 'index.html'));
    views.set(name, view);
    layoutViews();
    return view;
}

function destroyView(name) {
    const view = views.get(name);
    if (!view) return;

    views.delete(name);
    if (htmlFullscreenView === name) htmlFullscreenView = null;
    if (hubWindow && !hubWindow.isDestroyed()) hubWindow.contentView.removeChildView(view);
    view.webContents.close();
}

function closeToTray() {
    if (!hubWindow || hubWindow.isDestroyed()) return;

    rememberedMaximized = hubWindow.isMaximized();
    if (!rememberedMaximized && !hubWindow.isFullScreen()) rememberedBounds = hubWindow.getBounds();

    [...views.keys()].forEach(destroyView);
    history.length = 0;
    currentView = 'home';
    htmlFullscreenView = null;
    fullscreenRequestedByPage = false;
    revealWhenReady = false;
    hubWindow.destroy();
}

function applyCurrentView() {
    if (currentView !== 'home') {
        const alreadyLoaded = views.has(currentView);
        const view = ensureView(currentView);
        if (alreadyLoaded && currentView === 'status') view.webContents.send('refresh');
    }

    [...views.keys()].filter((name) => name !== currentView).forEach(destroyView);
    views.forEach((view, name) => view.setVisible(name === currentView));
    layoutViews();
    sendState();

    if (currentView !== 'home' && views.has(currentView)) views.get(currentView).webContents.focus();
}

function navigate(name, { record = true } = {}) {
    if (name !== 'home' && !VIEWS[name]) return;
    if (!hubWindow || hubWindow.isDestroyed()) return;

    if (record && currentView !== name) {
        history.push(currentView);
        if (history.length > HISTORY_LIMIT) history.shift();
    }
    currentView = name;
    applyCurrentView();
}

function goBack() {
    const previous = history.pop();
    if (!previous) return;
    navigate(previous, { record: false });
}

function requestClose() {
    if (settingsStore.getSettings().minimizeToTrayOnClose) {
        closeToTray();
        return;
    }
    logEvent('Exit requested by closing the main window (minimize to tray is off)', 'INFO');
    app.quit();
}

function createHubWindow() {
    hubWindow = new BrowserWindow({
        width: rememberedBounds ? rememberedBounds.width : 1360,
        height: rememberedBounds ? rememberedBounds.height : 880,
        ...(rememberedBounds ? { x: rememberedBounds.x, y: rememberedBounds.y } : {}),
        minWidth: 1000,
        minHeight: 680,
        show: false,
        frame: false,
        title: 'Alert Server',
        backgroundColor: backgroundColor(),
        icon: getResourcePath('icons', 'app-icon-256.png'),
        webPreferences: {
            preload: path.join(preloadDir, 'hubPreload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });

    hubWindow.setMenuBarVisibility(false);
    lockSelection(hubWindow.webContents);
    hubWindow.loadFile(path.join(rendererDir, 'hub', 'index.html'));

    ['resize', 'maximize', 'unmaximize'].forEach((eventName) => {
        hubWindow.on(eventName, () => {
            layoutViews();
            sendState();
        });
    });

    ['enter-full-screen', 'leave-full-screen'].forEach((eventName) => {
        hubWindow.on(eventName, () => {
            relayoutSoon();
            sendState();
        });
    });

    hubWindow.once('ready-to-show', () => {
        if (!revealWhenReady) return;
        revealWhenReady = false;
        if (rememberedMaximized) hubWindow.maximize();
        hubWindow.show();
        hubWindow.focus();
    });

    hubWindow.on('session-end', () => {
        isQuitting = true;
    });

    hubWindow.on('close', (event) => {
        if (isQuitting) return;
        event.preventDefault();
        requestClose();
    });

    hubWindow.on('closed', () => {
        hubWindow = null;
        views.clear();
        history.length = 0;
        currentView = 'home';
    });

    return hubWindow;
}

function showHub(view = null) {
    const isNewWindow = !hubWindow || hubWindow.isDestroyed();
    if (isNewWindow) {
        createHubWindow();
        revealWhenReady = true;
    }

    if (view && view !== currentView) navigate(view);
    else if (view) applyCurrentView();

    if (!isNewWindow) {
        if (hubWindow.isMinimized()) hubWindow.restore();
        hubWindow.show();
        hubWindow.focus();
    }
    return hubWindow;
}

function toggleStatus() {
    const visible = hubWindow && !hubWindow.isDestroyed() && hubWindow.isVisible() && !hubWindow.isMinimized();
    if (visible && hubWindow.isFocused() && currentView === 'status') {
        closeToTray();
        return;
    }
    showHub('status');
}

function isViewShowing(name) {
    return Boolean(hubWindow && !hubWindow.isDestroyed() && hubWindow.isVisible() && !hubWindow.isMinimized() && currentView === name);
}

function getView(name) {
    return views.get(name) || null;
}

function withView(name) {
    showHub(name);
    return views.get(name);
}

function minimizeHub() {
    if (hubWindow && !hubWindow.isDestroyed()) hubWindow.minimize();
}

function toggleMaximizeHub() {
    if (!hubWindow || hubWindow.isDestroyed()) return;
    if (hubWindow.isMaximized()) hubWindow.unmaximize();
    else hubWindow.maximize();
}

module.exports = {
    showHub,
    toggleStatus,
    navigate,
    goBack,
    requestClose,
    getView,
    isViewShowing,
    withView,
    currentState,
    minimizeHub,
    toggleMaximizeHub,
};

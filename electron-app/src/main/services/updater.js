// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { autoUpdater } = require('electron-updater');
const { app, Notification } = require('electron');
const { logEvent } = require('./logger');
const settingsStore = require('./settingsStore');
const { setTemporaryTooltip, clearTemporaryTooltip } = require('./tray');
const { getLatestMatchedAlerts } = require('./alertState');
const { askToUpdate } = require('../windows/updatePromptWindow');
const { fetchPolicy, resolveMode } = require('./updatePolicy');
const { extractHighlights } = require('./releaseHighlights');
const { getDictionary } = require('../../i18n/i18n');
const {
    openUpdateProgressWindow,
    setUpdateProgress,
    setUpdateStatus,
    closeUpdateProgressWindow,
} = require('../windows/updateProgressWindow');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let updateBusy = false;
let manualCheck = false;
let silentInstall = false;

autoUpdater.on('checking-for-update', () => {
    logEvent('Checking for updates (GitHub Releases)', 'NETWORK');
});

autoUpdater.on('update-not-available', () => {
    logEvent('No app update available (GitHub Releases)', 'NETWORK');
});

autoUpdater.on('update-available', async (info) => {
    logEvent(`Update available: ${info.version}`, 'NETWORK');

    if (updateBusy) return;

    if (!manualCheck && getLatestMatchedAlerts().length) {
        logEvent(`Update prompt for ${info.version} postponed: alert is active in a monitored region`, 'INFO');
        return;
    }

    updateBusy = true;

    const settings = settingsStore.getSettings();
    const mode = resolveMode(app.getVersion(), await fetchPolicy(), Date.now());

    if (mode.kind === 'silent') {
        logEvent(`Update ${info.version} is mandatory and past its grace period - downloading silently`, 'INFO');
        silentInstall = true;
        autoUpdater.downloadUpdate();
        return;
    }

    const choice = await askToUpdate({
        version: info.version,
        current: app.getVersion(),
        kind: mode.kind,
        highlights: extractHighlights(info.releaseNotes, settings.language),
    });

    if (choice === 'install') {
        logEvent(`Update ${info.version} confirmed - downloading`, 'INFO');
        openUpdateProgressWindow();
        autoUpdater.downloadUpdate();
    } else {
        logEvent(`Update ${info.version} postponed by user`, 'INFO');
        updateBusy = false;
    }
});

autoUpdater.on('download-progress', (progress) => {
    setUpdateProgress(progress.percent);
    setTemporaryTooltip(`Alert Server: завантаження оновлення ${Math.round(progress.percent)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
    if (silentInstall) {
        silentInstall = false;
        updateBusy = false;
        logEvent(`Update ${info.version} downloaded - it will be installed on the next restart`, 'INFO');
        new Notification({
            title: 'Alert Server',
            body: getDictionary(settingsStore.getSettings().language).updateSilentReady.replace('{version}', info.version),
        }).show();
        return;
    }

    logEvent(`Update ${info.version} downloaded - installing`, 'INFO');
    setUpdateProgress(100);
    setUpdateStatus('Завантажено, встановлення...');
    setTemporaryTooltip('Alert Server: оновлення завантажено, встановлення...');
    new Notification({
        title: 'Alert Server',
        body: `Оновлення ${info.version} завантажено. Застосунок перезапуститься для встановлення.`,
    }).show();
    setTimeout(() => autoUpdater.quitAndInstall(), 2000);
});

autoUpdater.on('error', (err) => {
    logEvent(`Auto-update error (GitHub Releases): ${err.message}`, 'NETWORK');
    updateBusy = false;
    silentInstall = false;
    clearTemporaryTooltip();
    closeUpdateProgressWindow();
});

function checkForUpdates() {
    autoUpdater.checkForUpdates();
}

async function checkForUpdatesNow() {
    if (updateBusy) return { status: 'busy' };

    manualCheck = true;
    try {
        const result = await autoUpdater.checkForUpdates();
        if (!result) return { status: 'unavailable' };
        if (result.isUpdateAvailable) return { status: 'available', version: result.updateInfo.version };
        return { status: 'upToDate' };
    } catch (err) {
        return { status: 'error' };
    } finally {
        manualCheck = false;
    }
}

function scheduleNextCheck() {
    const hours = settingsStore.getSettings().updateCheckIntervalHours;
    const intervalMs = Math.max(1, Math.min(24, hours)) * 60 * 60 * 1000;
    setTimeout(() => {
        checkForUpdates();
        scheduleNextCheck();
    }, intervalMs);
}

function delayedCheckForUpdates(delayMs = 10000) {
    setTimeout(checkForUpdates, delayMs);
    scheduleNextCheck();
}

module.exports = { delayedCheckForUpdates, checkForUpdatesNow };

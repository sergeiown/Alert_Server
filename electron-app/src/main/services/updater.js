// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { autoUpdater } = require('electron-updater');
const { dialog, Notification } = require('electron');
const { logEvent } = require('./logger');
const settingsStore = require('./settingsStore');
const { setTemporaryTooltip, clearTemporaryTooltip } = require('./tray');
const {
    openUpdateProgressWindow,
    setUpdateProgress,
    setUpdateStatus,
    closeUpdateProgressWindow,
} = require('../windows/updateProgressWindow');

autoUpdater.autoDownload = false;

// Registered once at module load, not per check - checkForUpdates() is called repeatedly, and
// re-registering these on every call would pile up duplicate listeners, each firing once per event.
let lastDeclinedVersion = null;

autoUpdater.on('checking-for-update', () => {
    logEvent('Checking for updates (GitHub Releases)', 'NETWORK');
});

autoUpdater.on('update-not-available', () => {
    logEvent('No update available', 'NETWORK');
});

autoUpdater.on('update-available', (info) => {
    logEvent(`Update available: ${info.version}`, 'NETWORK');

    if (info.version === lastDeclinedVersion) return;

    dialog
        .showMessageBox({
            type: 'question',
            buttons: ['Так', 'Ні'],
            defaultId: 0,
            title: 'Alert Server',
            message: `Доступна нова версія ${info.version}. Встановити зараз?`,
        })
        .then((result) => {
            if (result.response === 0) {
                logEvent(`Update ${info.version} confirmed, downloading`, 'INFO');
                openUpdateProgressWindow();
                autoUpdater.downloadUpdate();
            } else {
                logEvent(`Update ${info.version} declined by user`, 'INFO');
                lastDeclinedVersion = info.version;
            }
        });
});

autoUpdater.on('download-progress', (progress) => {
    setUpdateProgress(progress.percent);
    setTemporaryTooltip(`Alert Server: завантаження оновлення ${Math.round(progress.percent)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
    logEvent(`Update ${info.version} downloaded, installing`, 'INFO');
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
    clearTemporaryTooltip();
    closeUpdateProgressWindow();
});

function checkForUpdates() {
    autoUpdater.checkForUpdates();
}

// Re-scheduled after every check (rather than one fixed setInterval) so a change to
// updateCheckIntervalHours takes effect on the very next cycle, without needing an app restart.
function scheduleNextCheck() {
    const hours = settingsStore.getSettings().updateCheckIntervalHours;
    const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;
    setTimeout(() => {
        checkForUpdates();
        scheduleNextCheck();
    }, intervalMs);
}

function delayedCheckForUpdates(delayMs = 10000) {
    setTimeout(checkForUpdates, delayMs);
    scheduleNextCheck();
}

module.exports = { delayedCheckForUpdates };

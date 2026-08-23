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

// Registered once, not per check - checkForUpdates() itself is called repeatedly (once shortly
// after launch, then periodically for as long as the app keeps running), and re-registering these
// on every call would pile up duplicate listeners, each firing once per event.
let lastDeclinedVersion = null;

autoUpdater.on('checking-for-update', () => {
    logEvent('Checking for updates');
});

autoUpdater.on('update-not-available', () => {
    logEvent('No update available');
});

autoUpdater.on('update-available', (info) => {
    logEvent(`Update available: ${info.version}`);

    // Only asked once per version, not on every periodic recheck while it's still the latest -
    // declining an update shouldn't mean re-prompting every 12 hours for that same version.
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
                logEvent(`Update ${info.version} confirmed, downloading`);
                openUpdateProgressWindow();
                autoUpdater.downloadUpdate();
            } else {
                logEvent(`Update ${info.version} declined by user`);
                lastDeclinedVersion = info.version;
            }
        });
});

autoUpdater.on('download-progress', (progress) => {
    setUpdateProgress(progress.percent);
    setTemporaryTooltip(`Alert Server: завантаження оновлення ${Math.round(progress.percent)}%`);
});

autoUpdater.on('update-downloaded', (info) => {
    logEvent(`Update ${info.version} downloaded, installing`);
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
    logEvent(`Auto-update error: ${err.message}`);
    clearTemporaryTooltip();
    closeUpdateProgressWindow();
});

function checkForUpdates() {
    autoUpdater.checkForUpdates();
}

// A tray app is exactly the kind of thing people leave running for weeks without ever quitting or
// rebooting - a single check right after launch would then mean an update never reaches them at
// all, not just late, since nothing else in the app's lifecycle would trigger another check.
// Re-scheduled after every check (rather than one fixed setInterval) specifically so a change to
// this setting takes effect on the very next cycle, without needing the app restarted first.
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

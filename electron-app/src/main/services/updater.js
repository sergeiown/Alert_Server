const { autoUpdater } = require('electron-updater');
const { dialog, Notification } = require('electron');
const { logEvent } = require('./logger');
const { setTemporaryTooltip, clearTemporaryTooltip } = require('./tray');
const {
    openUpdateProgressWindow,
    setUpdateProgress,
    setUpdateStatus,
    closeUpdateProgressWindow,
} = require('../windows/updateProgressWindow');

autoUpdater.autoDownload = false;

function checkForUpdates() {
    autoUpdater.on('checking-for-update', () => {
        logEvent('Checking for updates');
    });

    autoUpdater.on('update-not-available', () => {
        logEvent('No update available');
    });

    autoUpdater.on('update-available', (info) => {
        logEvent(`Update available: ${info.version}`);

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

    autoUpdater.checkForUpdates();
}

function delayedCheckForUpdates(delayMs = 10000) {
    setTimeout(checkForUpdates, delayMs);
}

module.exports = { delayedCheckForUpdates };

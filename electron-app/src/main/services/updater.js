const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');
const { logEvent } = require('./logger');

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
                    autoUpdater.downloadUpdate();
                } else {
                    logEvent(`Update ${info.version} declined by user`);
                }
            });
    });

    autoUpdater.on('update-downloaded', (info) => {
        logEvent(`Update ${info.version} downloaded, installing`);
        autoUpdater.quitAndInstall();
    });

    autoUpdater.on('error', (err) => {
        logEvent(`Auto-update error: ${err.message}`);
    });

    autoUpdater.checkForUpdates();
}

function delayedCheckForUpdates(delayMs = 10000) {
    setTimeout(checkForUpdates, delayMs);
}

module.exports = { delayedCheckForUpdates };

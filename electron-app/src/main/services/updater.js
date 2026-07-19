const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');
const { logEvent } = require('./logger');

autoUpdater.autoDownload = false;

function checkForUpdates() {
    autoUpdater.on('update-available', (info) => {
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
                    autoUpdater.downloadUpdate();
                }
            });
    });

    autoUpdater.on('update-downloaded', () => {
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

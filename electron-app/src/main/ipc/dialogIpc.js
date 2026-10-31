// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const settingsStore = require('../services/settingsStore');
const { t } = require('../../i18n/i18n');
const { showMessage } = require('../windows/messageWindow');

function registerDialogIpc() {
    ipcMain.handle('dialog:confirmClearRegions', async () => {
        const { language } = settingsStore.getSettings();
        const choice = await showMessage({
            title: t('appName', language),
            message: t('clearRegionsConfirm', language),
            buttons: [
                { id: 'yes', label: t('dialogYes', language), primary: true },
                { id: 'cancel', label: t('dialogCancel', language) },
            ],
            cancelId: 'cancel',
        });
        return choice === 'yes';
    });
}

module.exports = { registerDialogIpc };

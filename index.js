/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { restoreConfigFiles } = require('./modules/configFilesRestoreHandler');

(async () => {
    try {
        await restoreConfigFiles();
    } catch (err) {
        console.error(`Error restoring configuration files:`, err);
    } finally {
        const { handleExceptionAndRestart, logSystemEvents } = require('./modules/systemEventAndErrorHandler');
        const { createTrayIcon } = require('./modules/trayIconManager');
        const { fetchDataAndSaveToFile } = require('./modules/apiRequestHandler');
        const { showNotification } = require('./modules/alertNotifier');
        const { delayedCheckForUpdates } = require('./modules/updateHandler');

        handleExceptionAndRestart();
        logSystemEvents();
        createTrayIcon();
        delayedCheckForUpdates();

        await fetchDataAndSaveToFile();
        await showNotification();
    }
})();

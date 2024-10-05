/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { restoreConfigFiles } = require('./modules/maintenance/configFilesRestoreHandler');
const { checkIntegrity } = require('./modules/maintenance/integrityChecker');

(async () => {
    try {
        await restoreConfigFiles();
        await checkIntegrity();
    } catch (err) {
        console.error(`Error during initialization:`, err);
    } finally {
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        await delay(2000);

        const { handleExceptionAndRestart, logSystemEvents } = require('./modules/systemEventAndErrorHandler');
        const { createTrayIcon } = require('./modules/trayMenu/trayIconManager');
        const { fetchDataAndSaveToFile } = require('./modules/alertManager/apiRequestHandler');
        const { showNotification } = require('./modules/alertManager/alertNotifier');
        const { delayedCheckForUpdates } = require('./modules/maintenance/updateHandler');

        handleExceptionAndRestart();
        logSystemEvents();
        createTrayIcon();
        delayedCheckForUpdates();

        await fetchDataAndSaveToFile();
        await showNotification();
    }
})();

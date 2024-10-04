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
        const { handleExceptionAndRestart, logSystemEvents } = require('./modules/systemEventAndErrorHandler');
        const { createTrayIcon } = require('./modules/trayIconManager');
        const { fetchDataAndSaveToFile } = require('./modules/apiRequestHandler');
        const { showNotification } = require('./modules/alertNotifier');
        const { delayedCheckForUpdates } = require('./modules/maintenance/updateHandler');

        handleExceptionAndRestart();
        logSystemEvents();
        createTrayIcon();
        delayedCheckForUpdates();

        await fetchDataAndSaveToFile();
        await showNotification();
    }
})();

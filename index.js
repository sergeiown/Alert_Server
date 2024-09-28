/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { fetchDataAndSaveToFile } = require('./modules/apiRequestHandler');
const { showNotification } = require('./modules/alertNotifier');
const { createTrayIcon } = require('./modules/trayIconManager');
const { handleExceptionAndRestart, logSystemEvents } = require('./modules/systemEventAndErrorHandler');
const { delayedCheckForUpdates } = require('./modules/updateHadler');

fetchDataAndSaveToFile();

showNotification();

createTrayIcon();

handleExceptionAndRestart();

logSystemEvents();

delayedCheckForUpdates();

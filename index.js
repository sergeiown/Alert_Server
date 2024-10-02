/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { handleExceptionAndRestart, logSystemEvents } = require('./modules/systemEventAndErrorHandler');
const { createTrayIcon } = require('./modules/trayIconManager');
const { fetchDataAndSaveToFile } = require('./modules/apiRequestHandler');
const { showNotification } = require('./modules/alertNotifier');
const { delayedCheckForUpdates } = require('./modules/updateHadler');

handleExceptionAndRestart();

logSystemEvents();

createTrayIcon();

fetchDataAndSaveToFile();

showNotification();

delayedCheckForUpdates();

/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { fetchDataAndSaveToFile } = require('./modules/api');
const { showNotification } = require('./modules/notification');
const { createTrayIcon } = require('./modules/trayIcon');
const { restartOnException } = require('./modules/errorRecoveryService');

fetchDataAndSaveToFile();

showNotification();

createTrayIcon();

restartOnException();

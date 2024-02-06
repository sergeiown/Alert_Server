/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

const { logEvent } = require('./modules/logger');
const { fetchDataAndSaveToFile } = require('./modules/api');
const { showNotification } = require('./modules/notification');
const { createTrayIcon } = require('./modules/trayIcon');

logEvent(`Start of the server`);

fetchDataAndSaveToFile();

showNotification();

createTrayIcon();

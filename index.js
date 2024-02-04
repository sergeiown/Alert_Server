const { logEvent } = require('./modules/logger');
const { fetchDataAndSaveToFile } = require('./modules/api');
const { showNotification } = require('./modules/notification');
const { createTrayIcon } = require('./modules/trayIcon');

logEvent(`Start of the server`);

fetchDataAndSaveToFile();

showNotification();

createTrayIcon();

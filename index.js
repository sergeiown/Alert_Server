const { fetchDataAndSaveToFile } = require('./modules/api');
const { showNotification } = require('./modules/notification');
const { logEvent } = require('./modules/logger');

logEvent(`Start of the server`);

fetchDataAndSaveToFile();

showNotification();

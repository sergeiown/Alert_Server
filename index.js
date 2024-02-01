const { fetchDataAndSaveToFile } = require('./modules/api');
const showNotification = require('./modules/notification');
const { logError } = require('./modules/logger');

logError(`Start of the server`);

fetchDataAndSaveToFile();

showNotification();

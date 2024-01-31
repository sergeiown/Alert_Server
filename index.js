const fs = require('fs');
const path = require('path');
const { fetchDataAndSaveToFile } = require('./modules/api');
const showNotification = require('./modules/notification');

const logFilePath = path.join(__dirname, 'log.txt');
const currentDateTime = new Date().toLocaleString('UA').replace(',', '');

const successMessage = `${currentDateTime} Starting the server\n`;
fs.appendFileSync(logFilePath, successMessage, 'utf-8');

fetchDataAndSaveToFile();

setInterval(fetchDataAndSaveToFile, 60000);

showNotification();

const { log } = require('console');
const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../log.txt');

const logError = (errorMessage) => {
    const currentDateTime = new Date().toLocaleString('UA').replace(',', '');
    const logMessage = `${currentDateTime} ${errorMessage}\n`;

    fs.appendFileSync(logFilePath, logMessage, 'utf-8');
    console.log(logMessage);
};

module.exports = { logError };

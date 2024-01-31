const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../log.txt');

const logError = (errorMessage) => {
    const currentDateTime = new Date().toLocaleString('UA').replace(',', '');
    const logMessage = `${currentDateTime} ERROR: ${errorMessage}\n`;

    fs.appendFileSync(logFilePath, logMessage, 'utf-8');
};

module.exports = { logError };

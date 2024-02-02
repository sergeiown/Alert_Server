const { log } = require('console');
const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../log.txt');

const logError = (errorMessage) => {
    const currentDateTime = new Date()
        .toLocaleString('UA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
        .replace(',', '');
    const logMessage = `${currentDateTime} ${errorMessage}\n`;

    fs.appendFileSync(logFilePath, logMessage, 'utf-8');
    log(logMessage);
};

module.exports = { logError };

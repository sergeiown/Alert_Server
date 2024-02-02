const { log } = require('console');
const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../log.csv');

const logError = (eventMessage) => {
    const currentDateTime = new Date()
        .toLocaleString('UA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
        .replace(/,\s*/g, ',');

    const logMessage = `${currentDateTime},${eventMessage.trim()}`;

    fs.appendFileSync(logFilePath, logMessage + '\n', 'utf-8');
    log(logMessage);
};

module.exports = { logError };

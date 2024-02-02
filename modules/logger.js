const { log } = require('console');
const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../log.txt');

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
        .replace(',', '');

    const maxMessageLength = 100;
    const separator = '.';

    if (eventMessage.length > maxMessageLength - currentDateTime.length - separator.length) {
        eventMessage = eventMessage.slice(0, maxMessageLength - currentDateTime.length - separator.length);
    }

    const eventMessagePadded = eventMessage.padStart(
        maxMessageLength - currentDateTime.length - separator.length,
        separator
    );

    const logMessage = `[${currentDateTime}]${eventMessagePadded}\n`;

    fs.appendFileSync(logFilePath, logMessage, 'utf-8');
    log(logMessage);
};

module.exports = { logError };

const { log, error } = require('console');
const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../log.csv');

const initializeLogFile = () => {
    try {
        if (!fs.existsSync(logFilePath)) {
            const header = 'Date,Time,Event';
            fs.writeFileSync(logFilePath, header + '\n', 'utf-8');
        }
    } catch (error) {
        error(`Error initializing log file: ${error.message}`);
    }
};

const logEvent = (eventMessage) => {
    initializeLogFile();

    const maxFileSize = 100 * 1024; // 100Kb

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

    try {
        const stats = fs.statSync(logFilePath);
        if (stats.size > maxFileSize) {
            const fileContent = fs.readFileSync(logFilePath, 'utf-8').split('\n');
            const newContent = 'Date,Time,Event\n' + fileContent.slice(10).join('\n');
            const fileSize = `${currentDateTime},Log file size: ${(stats.size / 1024).toFixed(2)} Kb and reduced.`;

            fs.writeFileSync(logFilePath, newContent + '\n' + fileSize, 'utf-8');
            log(fileSize);
        }
    } catch (error) {
        error(`Log file reduction error: ${error.message}`);
    }

    const logMessage = `${currentDateTime},${eventMessage.trim()}`;

    fs.appendFileSync(logFilePath, logMessage + '\n', 'utf-8');
    log(logMessage);
};

module.exports = { logEvent };

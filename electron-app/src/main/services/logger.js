const fs = require('fs');
const os = require('os');
const { getUserDataFile } = require('./appPaths');

const MAX_SIZE_BYTES = 256 * 1024;
const LINES_TO_DROP = 100;

function initializeLogFile() {
    const filePath = getUserDataFile('event.log');
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, 'Date,Time,Event' + os.EOL, 'utf-8');
    }
}

function truncateIfNeeded(filePath) {
    const { size } = fs.statSync(filePath);
    if (size <= MAX_SIZE_BYTES) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(os.EOL);
    const header = lines[0];
    const remaining = lines.slice(LINES_TO_DROP + 1);

    const rebuilt = [
        header,
        ...remaining,
        `Log file reduced (was ${size} bytes)`,
        `Dropped the first ${LINES_TO_DROP} lines`,
    ].join(os.EOL);

    fs.writeFileSync(filePath, rebuilt, 'utf-8');
}

function logEvent(message) {
    const filePath = getUserDataFile('event.log');
    initializeLogFile();
    truncateIfNeeded(filePath);

    const now = new Date();
    const date = now.toLocaleDateString('uk-UA');
    const time = now.toLocaleTimeString('uk-UA');
    const text = typeof message === 'string' ? message : JSON.stringify(message);

    fs.appendFileSync(filePath, `${date},${time},${text}${os.EOL}`, 'utf-8');

    console.log(text);
}

module.exports = { logEvent };

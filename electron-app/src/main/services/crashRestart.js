const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const { logEvent } = require('./logger');

const RESTART_MARKER_PATH = path.join(os.tmpdir(), 'alertserver_restart.tmp');
const MIN_RESTART_INTERVAL_MS = 5000;

function writeRestartTimestamp() {
    fs.writeFileSync(RESTART_MARKER_PATH, Date.now().toString(), 'utf-8');
}

function tooSoonSinceLastRestart() {
    if (!fs.existsSync(RESTART_MARKER_PATH)) return false;
    const lastRestart = parseInt(fs.readFileSync(RESTART_MARKER_PATH, 'utf-8'), 10);
    return Date.now() - lastRestart < MIN_RESTART_INTERVAL_MS;
}

function installHandlers() {
    writeRestartTimestamp();

    process.on('uncaughtException', (err) => {
        logEvent(`Uncaught exception: ${err.message}`);
        logEvent(err.stack || '');

        if (tooSoonSinceLastRestart()) {
            logEvent('Restart loop detected, exiting without relaunch');
            app.exit(3);
            return;
        }

        writeRestartTimestamp();
        app.relaunch();
        app.exit();
    });

    process.on('SIGINT', () => app.exit(0));
    process.on('SIGHUP', () => app.exit(1));
    process.on('SIGBREAK', () => app.exit(2));

    process.on('exit', (code) => {
        logEvent(`Process exiting with code ${code}`);
    });
}

module.exports = { installHandlers };

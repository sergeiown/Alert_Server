/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { exec } = require('child_process');
const path = require('path');
const { logEvent } = require('./logger');
const messages = require('./messages');

logEvent(messages.msg_01);

function restartOnException() {
    const batFilePath = path.join(__dirname, '..', 'start_alertserver_hidden.bat');

    process.on('uncaughtException', (error) => {
        logEvent(`${messages.msg_50} ${error.message}`);

        exec(`cmd /c "${batFilePath}"`, (error) => {
            if (error) {
                logEvent(messages.msg_56);
                return;
            }
        });
    });
}

function logOnExit() {
    let terminationMessage = messages.msg_61;

    process.on('SIGINT', () => {
        terminationMessage = messages.msg_62;
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        terminationMessage = messages.msg_63;
        process.exit(0);
    });

    process.on('exit', (code) => {
        logEvent(terminationMessage);
        logEvent(`${messages.msg_19} Code: ${code}`);
    });
}

module.exports = { restartOnException, logOnExit };

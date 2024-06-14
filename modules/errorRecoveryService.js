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
    const exitHandler = () => {
        process.exit();
    };

    process.on('SIGINT', exitHandler);
    process.on('SIGHUP', exitHandler);
    process.on('SIGTERM', exitHandler);
    process.on('exit', () => {
        logEvent(messages.msg_19);
    });
}

module.exports = { restartOnException, logOnExit };

/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const process = require('node:process');
const { exec } = require('child_process');
const path = require('path');
const { logEvent } = require('./logger');
const messages = require('./messages');

logEvent(messages.msg_01);

function handleExceptionAndRestart() {
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

function logSystemEvents() {
    const exitHandler = (code) => {
        process.exit(code);
    };

    process.on('warning', (warning) => {
        logEvent(`${warning.name} ${warning.message}`);
    });

    process.on('SIGINT', () => {
        process.exitCode = 0;
        exitHandler(0);
    });
    process.on('SIGHUP', () => {
        process.exitCode = 1;
        exitHandler(1);
    });
    process.on('SIGBREAK', () => {
        process.exitCode = 2;
        exitHandler(2);
    });
    process.on('exit', (code) => {
        switch (code) {
            case 0:
                logEvent(messages.msg_61);
                break;
            case 1:
                logEvent(messages.msg_62);
                break;
            case 2:
                logEvent(messages.msg_63);
                break;
            default:
                logEvent(`${messages.msg_19} ${code}`);
                break;
        }
    });
}

module.exports = { handleExceptionAndRestart, logSystemEvents };

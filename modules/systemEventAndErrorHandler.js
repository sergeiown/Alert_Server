/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { logEvent } = require('./logger');
const messages = require('./messageLoader');

logEvent(messages.msg_01);

const restartFilePath = path.join(process.env.TEMP, 'alertserver_restart.tmp');

function writeRestartTimestamp() {
    const timestamp = Date.now().toString();
    fs.writeFileSync(restartFilePath, timestamp, 'utf8');
}

function checkRestartFrequency() {
    try {
        const fileContent = fs.readFileSync(restartFilePath, 'utf8');
        const lastTimestamp = parseInt(fileContent, 10);
        const currentTime = Date.now();
        const timeDifference = currentTime - lastTimestamp;

        if (timeDifference < 5000) {
            process.exit(3);
        }
    } catch (error) {
        return;
    }
}

function handleExceptionAndRestart() {
    const batFilePath = path.join(__dirname, '..', 'start_alertserver_hidden.bat');

    process.on('uncaughtException', (error) => {
        logEvent(messages.msg_50);
        logEvent(error.message);
        logEvent(error.stack);

        checkRestartFrequency();

        writeRestartTimestamp();

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
        logEvent(warning.message);
        logEvent(warning.stack);
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
                logEvent(`${messages.msg_61} ${code}`);
                break;
            case 1:
                logEvent(`${messages.msg_62} ${code}`);
                break;
            case 2:
                logEvent(`${messages.msg_63} ${code}`);
                break;
            case 3:
                logEvent(`${messages.msg_64} ${code}`);
                break;
            default:
                logEvent(`${messages.msg_19} ${code}`);
                break;
        }
    });
}

module.exports = { writeRestartTimestamp, handleExceptionAndRestart, logSystemEvents };

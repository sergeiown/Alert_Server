/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { logEvent } = require('./logger');
const messages = require('./messageLoader');

const restartFilePath = path.join(process.env.TEMP, 'alertserver_restart.tmp');

const writeRestartTimestamp = () => {
    const timestamp = Date.now().toString();
    fs.writeFileSync(restartFilePath, timestamp, 'utf8');
};

const checkRestartFrequency = () => {
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
};

const formatStackTrace = (stack) => {
    return stack
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
};

const handleExceptionAndRestart = () => {
    const batFilePath = path.join(process.cwd(), 'start_alertserver_hidden.bat');

    process.on('uncaughtException', (error) => {
        logEvent(messages.msg_50);
        logEvent(error.message);
        formatStackTrace(error.stack).forEach((line) => logEvent(line));

        checkRestartFrequency();
        writeRestartTimestamp();

        exec(`cmd /c "${batFilePath}"`, (error) => {
            if (error) {
                logEvent(messages.msg_56);
                return;
            }
        });
    });
};

const logSystemEvents = () => {
    const exitHandler = (code) => process.exit(code);

    process.on('warning', (warning) => {
        logEvent(warning.message);
        formatStackTrace(warning.stack).forEach((line) => logEvent(line));
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
        let message;
        switch (code) {
            case 0:
                message = `${messages.msg_61} ${code}`;
                break;
            case 1:
                message = `${messages.msg_62} ${code}`;
                break;
            case 2:
                message = `${messages.msg_63} ${code}`;
                break;
            case 3:
                message = `${messages.msg_64} ${code}`;
                break;
            default:
                message = `${messages.msg_19} ${code}`;
                break;
        }
        logEvent(message);
    });
};

writeRestartTimestamp();

logEvent(messages.msg_01);

module.exports = { handleExceptionAndRestart, logSystemEvents };

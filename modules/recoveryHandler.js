/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const messages = require('./messageLoader');

const lockFilePath = path.join(process.env.TEMP, 'alertserver_recovery.tmp');

function handleRecovery(error) {
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

    const errorMessage = `${currentDateTime},${messages.msg_85} ${error.path}`;
    const logMessage = `${currentDateTime},${messages.msg_86}`;
    const logFilePath = path.join(process.cwd(), 'event.log');
    const recoveryBatPath = path.join(process.cwd(), 'start_recovery.bat');

    if (fs.existsSync(lockFilePath)) {
        return;
    }

    fs.appendFileSync(logFilePath, errorMessage + os.EOL, 'utf-8');
    fs.appendFileSync(logFilePath, logMessage + os.EOL, 'utf-8');
    console.error(errorMessage);

    const timestamp = Date.now().toString();
    fs.writeFileSync(lockFilePath, timestamp, 'utf-8');

    exec(`start cmd /c "${recoveryBatPath}"`, (execError) => {
        if (execError) {
            console.error(execError.message);
        }
    });
}

module.exports = { handleRecovery };
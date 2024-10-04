/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const lockFilePath = path.join(process.env.TEMP, 'alertserver_recovery.tmp');

const backupConfigFiles = () => {
    const backupDir = path.join(process.env.TEMP, 'backup_configs');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    const configFiles = ['location.json', 'settings.json', 'event.log'];

    configFiles.forEach((file) => {
        const filePath = path.join(process.cwd(), file);
        if (fs.existsSync(filePath)) {
            const backupFilePath = path.join(backupDir, file);
            fs.copyFileSync(filePath, backupFilePath);
        }
    });
};

const checkIntegrity = async () => {
    const filesToCheck = ['alert_types.json', 'location.json', 'messages.json', 'package.json'];
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
    const logFilePath = path.join(process.cwd(), 'event.log');
    const recoveryBatPath = path.join(process.cwd(), 'start_recovery.bat');
    let allFilesExist = true;

    for (const file of filesToCheck) {
        const filePath = path.join(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
            const errorMessage = `${currentDateTime},File ${file} not found`;
            fs.appendFileSync(logFilePath, errorMessage + os.EOL, 'utf-8');
            allFilesExist = false;
            break;
        }
    }

    if (allFilesExist) {
        return;
    }

    const logMessage = `${currentDateTime},Performing recovery`;

    if (fs.existsSync(lockFilePath)) {
        return;
    }

    const timestamp = Date.now().toString();
    fs.writeFileSync(lockFilePath, timestamp, 'utf-8');

    fs.appendFileSync(logFilePath, logMessage + os.EOL, 'utf-8');

    backupConfigFiles();

    exec(`start cmd /c "${recoveryBatPath}"`, (execError) => {
        if (execError) {
            console.error(execError.message);
        }
    });
};

module.exports = { checkIntegrity };

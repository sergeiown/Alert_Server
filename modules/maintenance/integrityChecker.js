/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { backupConfigFiles } = require('./configFilesBackupHandler');
const { logEvent } = require('../logger');

const checkIntegrity = async () => {
    const filesToCheck = ['alert_types.json', 'location.json', 'messages.json', 'package.json'];
    const recoveryBatPath = path.join(process.cwd(), 'start_recovery.bat');
    let allFilesExist = true;

    for (const file of filesToCheck) {
        const filePath = path.join(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
            const errorMessage = `File ${file} not found`;
            logEvent(errorMessage);
            allFilesExist = false;
            break;
        }
    }

    if (allFilesExist) {
        const successMessage = `Integrity is checked`;
        logEvent(successMessage);
        return;
    }

    const logMessage = `Performing a restore from repository`;
    logEvent(logMessage);

    backupConfigFiles();

    exec(`start cmd /c "${recoveryBatPath}"`, (execError) => {
        if (execError) {
            logEvent(execError.message);
        }
    });
};

module.exports = { checkIntegrity };

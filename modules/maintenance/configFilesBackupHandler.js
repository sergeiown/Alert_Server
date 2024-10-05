/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs');
const path = require('path');
const { logEvent } = require('../logger');

const configFiles = ['location.json', 'settings.json', 'event.log'];

const backupConfigFiles = () => {
    const backupDir = path.join(process.env.TEMP, 'backup_configs');

    try {
        fs.mkdirSync(backupDir, { recursive: true });
    } catch (err) {
        logEvent(err.message);
        return;
    }

    for (const file of configFiles) {
        const filePath = path.join(process.cwd(), file);

        try {
            const fileExists = fs.existsSync(filePath);

            if (fileExists) {
                const backupFilePath = path.join(backupDir, file);
                const logMessage = `Saved to backup: ${file}`;
                logEvent(logMessage);
                fs.copyFileSync(filePath, backupFilePath);
            }
        } catch (err) {
            logEvent(err.message);
        }
    }
};

module.exports = { backupConfigFiles };

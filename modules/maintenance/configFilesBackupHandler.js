/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const configFiles = ['location.json', 'settings.json', 'event.log'];

const logFilePath = path.join(process.cwd(), 'event.log');

const getCurrentDateTime = () =>
    new Date()
        .toLocaleString('UA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
        .replace(/,\s*/g, ',');

const backupConfigFiles = () => {
    const backupDir = path.join(process.env.TEMP, 'backup_configs');

    try {
        fs.mkdirSync(backupDir, { recursive: true });
    } catch (error) {
        const errorMessage = `${getCurrentDateTime()},Failed to create backup directory${os.EOL}`;
        fs.appendFileSync(logFilePath, errorMessage);
        return;
    }

    for (const file of configFiles) {
        const filePath = path.join(process.cwd(), file);

        try {
            const fileExists = fs.existsSync(filePath);

            if (fileExists) {
                const backupFilePath = path.join(backupDir, file);
                const logMessage = `${getCurrentDateTime()},Backup is created for ${file}${os.EOL}`;
                fs.copyFileSync(filePath, backupFilePath);
                fs.appendFileSync(logFilePath, logMessage);
            }
        } catch (error) {
            const errorMessage = `${getCurrentDateTime()},Error copying file ${file}${os.EOL}`;
            fs.appendFileSync(logFilePath, errorMessage);
        }
    }
};

module.exports = { backupConfigFiles };

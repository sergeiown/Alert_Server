/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const restoreConfigFiles = async () => {
    const backupDir = path.join(process.env.TEMP, 'backup_configs');
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

    let logMessages = '';

    try {
        await fs.access(backupDir);

        const files = await fs.readdir(backupDir);

        for (const file of files) {
            const backupFilePath = path.join(backupDir, file);
            const targetFilePath = path.join(process.cwd(), file);

            try {
                await fs.copyFile(backupFilePath, targetFilePath);

                const logMessage = `${getCurrentDateTime()},Restored file: ${file}${os.EOL}`;
                logMessages += logMessage;
            } catch (err) {
                const errorMessage = `${getCurrentDateTime()},Error restoring file: ${file} - ${err.message}${os.EOL}`;
                logMessages += errorMessage;
            }
        }

        const successMessage = `${getCurrentDateTime()},Recovery process successfully completed${os.EOL}`;
        logMessages += successMessage;

        if (logMessages) {
            await fs.appendFile(logFilePath, logMessages);
        }

        try {
            await fs.rm(backupDir, { recursive: true });
        } catch (err) {
            const errorMessage = `${getCurrentDateTime()},Failed to remove backup directory: ${backupDir} - ${
                err.message
            }${os.EOL}`;
            logMessages += errorMessage;
            await fs.appendFile(logFilePath, errorMessage);
        }
    } catch (err) {
        const errorMessage = `${getCurrentDateTime()},${backupDir} directory does not exist. There is nothing to restore${
            os.EOL
        }`;
        logMessages += errorMessage;
        await fs.appendFile(logFilePath, errorMessage);
    }
};

module.exports = { restoreConfigFiles };

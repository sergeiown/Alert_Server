/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const { logEvent } = require('../logger');

const restoreConfigFiles = async () => {
    const backupDir = path.join(process.env.TEMP, 'backup_configs');

    try {
        await fs.access(backupDir);

        const files = await fs.readdir(backupDir);

        for (const file of files) {
            const backupFilePath = path.join(backupDir, file);
            const targetFilePath = path.join(process.cwd(), file);

            try {
                await fs.copyFile(backupFilePath, targetFilePath);

                const logMessage = `Restored from backup: ${file}`;
                logEvent(logMessage);
            } catch (err) {
                logEvent(err.message);
            }
        }

        const successMessage = `Recovery process is successfully completed`;
        logEvent(successMessage);

        try {
            await fs.rm(backupDir, { recursive: true });
        } catch (err) {
            logEvent(err.message);
        }
    } catch (err) {
        const messageAboutUselessness = `There is no backup for recovery`;
        logEvent(messageAboutUselessness);
    }
};

module.exports = { restoreConfigFiles };

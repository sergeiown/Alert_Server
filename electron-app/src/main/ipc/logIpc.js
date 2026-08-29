// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { spawn } = require('child_process');
const { ipcMain } = require('electron');
const { getUserDataFile } = require('../services/appPaths');
const { clearLog, LOG_FILE } = require('../services/logger');

function registerLogIpc() {
    ipcMain.handle('log:getContent', () => {
        const filePath = getUserDataFile(LOG_FILE);
        if (!fs.existsSync(filePath)) return { content: '', size: 0 };

        const content = fs.readFileSync(filePath, 'utf-8');
        const { size } = fs.statSync(filePath);
        return { content, size };
    });

    ipcMain.handle('log:clear', () => {
        clearLog();
        return true;
    });

    ipcMain.handle('log:openInNotepad', () => {
        spawn('notepad.exe', [getUserDataFile(LOG_FILE)], { detached: true, stdio: 'ignore' }).unref();
        return true;
    });
}

module.exports = { registerLogIpc };

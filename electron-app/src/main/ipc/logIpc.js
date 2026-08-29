// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const { ipcMain } = require('electron');
const { getUserDataFile } = require('../services/appPaths');
const { clearLog, LOG_FILE } = require('../services/logger');

// The "App Paths" registry key is the standard, version-independent way Windows itself resolves
// a well-known app by executable name (what ShellExecute/Start-Process use under the hood) - it
// exists only if Excel is actually installed, and its default value is Excel's real exe path, so
// one query serves both the "is it installed" check and the path needed to launch it.
const EXCEL_APP_PATHS_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\EXCEL.EXE';

function getExcelPath() {
    try {
        const output = execFileSync('reg', ['query', EXCEL_APP_PATHS_KEY, '/ve'], { encoding: 'utf-8' });
        const match = output.match(/REG_SZ\s+(.+)/);
        return match ? match[1].trim() : null;
    } catch (err) {
        return null;
    }
}

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

    ipcMain.handle('log:isExcelAvailable', () => Boolean(getExcelPath()));

    ipcMain.handle('log:openInExcel', () => {
        const excelPath = getExcelPath();
        if (!excelPath) return false;
        spawn(excelPath, [getUserDataFile(LOG_FILE)], { detached: true, stdio: 'ignore' }).unref();
        return true;
    });
}

module.exports = { registerLogIpc };

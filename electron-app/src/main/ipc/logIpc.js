const fs = require('fs');
const { ipcMain } = require('electron');
const { getUserDataFile } = require('../services/appPaths');
const { clearLog } = require('../services/logger');

function registerLogIpc() {
    ipcMain.handle('log:getContent', () => {
        const filePath = getUserDataFile('event.log');
        if (!fs.existsSync(filePath)) return { content: '', size: 0 };

        const content = fs.readFileSync(filePath, 'utf-8');
        const { size } = fs.statSync(filePath);
        return { content, size };
    });

    ipcMain.handle('log:clear', () => {
        clearLog();
        return true;
    });
}

module.exports = { registerLogIpc };

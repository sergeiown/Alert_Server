const { ipcMain, app, clipboard } = require('electron');
const { logEvent } = require('../services/logger');

function registerSystemIpc() {
    ipcMain.handle('system:getLoginItem', () => app.getLoginItemSettings().openAtLogin);
    ipcMain.handle('system:setLoginItem', (event, openAtLogin) => {
        app.setLoginItemSettings({ openAtLogin });
        logEvent(`Run at startup ${openAtLogin ? 'enabled' : 'disabled'}`);
        return app.getLoginItemSettings().openAtLogin;
    });
    ipcMain.handle('system:copyToClipboard', (event, text) => {
        clipboard.writeText(text);
    });
}

module.exports = { registerSystemIpc };

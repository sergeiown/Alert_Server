const { ipcMain, app, clipboard } = require('electron');

function registerSystemIpc() {
    ipcMain.handle('system:getLoginItem', () => app.getLoginItemSettings().openAtLogin);
    ipcMain.handle('system:setLoginItem', (event, openAtLogin) => {
        app.setLoginItemSettings({ openAtLogin });
        return app.getLoginItemSettings().openAtLogin;
    });
    ipcMain.handle('system:copyToClipboard', (event, text) => {
        clipboard.writeText(text);
    });
}

module.exports = { registerSystemIpc };

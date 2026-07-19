const { ipcMain, app } = require('electron');

function registerSystemIpc() {
    ipcMain.handle('system:getLoginItem', () => app.getLoginItemSettings().openAtLogin);
    ipcMain.handle('system:setLoginItem', (event, openAtLogin) => {
        app.setLoginItemSettings({ openAtLogin });
        return app.getLoginItemSettings().openAtLogin;
    });
}

module.exports = { registerSystemIpc };

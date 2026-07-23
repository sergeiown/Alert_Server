const { ipcMain, app, clipboard, shell, nativeImage } = require('electron');
const { logEvent } = require('../services/logger');
const { getResourcePath } = require('../services/appPaths');

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
    ipcMain.handle('system:getVersion', () => app.getVersion());
    ipcMain.handle('system:openExternal', (event, url) => shell.openExternal(url));
    ipcMain.handle('system:getAboutIcon', () =>
        nativeImage.createFromPath(getResourcePath('icons', 'sagittarius_1x1.png')).resize({ width: 96, height: 96 }).toDataURL()
    );
}

module.exports = { registerSystemIpc };

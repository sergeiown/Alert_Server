const { ipcMain, nativeImage } = require('electron');
const settingsStore = require('../services/settingsStore');
const { getLatestMatchedAlerts } = require('../services/alertState');
const { alertTypeName } = require('../services/alertTypes');
const { getResourcePath } = require('../services/appPaths');

function registerTrayPopupIpc() {
    ipcMain.handle('trayPopup:getIcon', () =>
        nativeImage.createFromPath(getResourcePath('icons', 'app-icon-256.png')).toDataURL()
    );

    ipcMain.handle('trayPopup:getAlerts', () => {
        const language = settingsStore.getSettings().language;

        return getLatestMatchedAlerts().map((alert) => ({
            location: language === 'English' ? alert.location_lat : alert.location_title,
            type: alertTypeName(alert.alert_type, language),
            startedAt: alert.started_at,
        }));
    });
}

module.exports = { registerTrayPopupIpc };

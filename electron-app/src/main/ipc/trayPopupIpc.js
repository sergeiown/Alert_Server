const { ipcMain, nativeImage } = require('electron');
const settingsStore = require('../services/settingsStore');
const { getLatestMatchedAlerts } = require('../services/alertState');
const { alertTypeName } = require('../services/alertTypes');
const { getResourcePath } = require('../services/appPaths');
const { getUpcomingPredictions } = require('../services/forecastWatcher');

const POPUP_FORECAST_LIMIT = 3;

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

    ipcMain.handle('trayPopup:getForecast', () => {
        const language = settingsStore.getSettings().language;
        return getUpcomingPredictions(language, POPUP_FORECAST_LIMIT).map((prediction) => ({
            name: prediction.name,
            predictedAt: prediction.predictedAt,
        }));
    });
}

module.exports = { registerTrayPopupIpc };

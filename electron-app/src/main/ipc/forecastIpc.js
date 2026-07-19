const { ipcMain } = require('electron');
const regionsStore = require('../services/regionsStore');
const settingsStore = require('../services/settingsStore');
const { getLocationLookup } = require('../services/locationFilter');
const { getLatestAlertData } = require('../services/alertPoller');
const { getRegionForecastText } = require('../services/forecast');

function registerForecastIpc() {
    ipcMain.handle('forecast:getRegions', () => {
        const language = settingsStore.getSettings().language;
        const lookup = getLocationLookup();

        return regionsStore.getSelectedUids().map((uid) => {
            const info = lookup.get(String(uid));
            const name = info ? (language === 'English' ? info.lat : info.name) : String(uid);
            return { uid, name };
        });
    });

    ipcMain.handle('forecast:getRegionForecast', async (event, uid) => {
        const language = settingsStore.getSettings().language;
        const activeData = getLatestAlertData();
        const isActive = Boolean(
            activeData && activeData.alerts.some((alert) => String(alert.location_uid) === String(uid))
        );

        if (isActive) return { status: 'active' };

        const text = await getRegionForecastText(uid, language);
        if (!text) return { status: 'empty' };

        return { status: 'ok', text };
    });
}

module.exports = { registerForecastIpc };

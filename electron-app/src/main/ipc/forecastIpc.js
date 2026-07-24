const { ipcMain, dialog, BrowserWindow } = require('electron');
const regionsStore = require('../services/regionsStore');
const settingsStore = require('../services/settingsStore');
const { getLocationLookup, getAlertCoverageUids, getAncestorUids } = require('../services/locationFilter');
const { getLatestAlertData } = require('../services/alertPoller');
const { getRegionForecastText, getRegionSoonestEtaMs, fetchHistoryAlerts } = require('../services/forecast');
const historyStore = require('../services/forecastHistoryStore');
const { logEvent } = require('../services/logger');
const { t } = require('../../i18n/i18n');

function registerForecastIpc() {
    ipcMain.handle('forecast:getRegions', () => {
        const language = settingsStore.getSettings().language;
        const lookup = getLocationLookup();
        const selectedUids = regionsStore.getSelectedUids();
        const selectedSet = new Set(selectedUids.map(String));

        return selectedUids
            .filter((uid) => !getAncestorUids(uid).some((ancestor) => selectedSet.has(String(ancestor))))
            .map((uid) => {
                const info = lookup.get(String(uid));
                const name = info ? (language === 'English' ? info.lat : info.name) : String(uid);
                return { uid, name };
            });
    });

    ipcMain.handle('forecast:getRegionForecast', async (event, uid) => {
        const language = settingsStore.getSettings().language;
        const activeData = getLatestAlertData();
        const isActive = Boolean(
            activeData && activeData.alerts.some((alert) => getAlertCoverageUids(alert).includes(String(uid)))
        );

        if (isActive) return { status: 'active' };

        const text = await getRegionForecastText(uid, language);
        if (!text) {
            fetchHistoryAlerts(uid).catch((err) => logEvent(`Forecast prefetch failed for uid ${uid}: ${err.message}`));
            return { status: 'empty' };
        }

        return { status: 'ok', text, etaMs: getRegionSoonestEtaMs(uid) };
    });

    ipcMain.handle('forecast:getLocalStats', () => historyStore.getStats());

    ipcMain.handle('forecast:clearLocalStats', async (event) => {
        const language = settingsStore.getSettings().language;
        const window = BrowserWindow.fromWebContents(event.sender);

        const { response } = await dialog.showMessageBox(window, {
            type: 'warning',
            buttons: [t('forecastClearStatsConfirmYes', language), t('forecastClearStatsConfirmNo', language)],
            defaultId: 1,
            cancelId: 1,
            title: t('forecastClearStatsTitle', language),
            message: t('forecastClearStatsWarning', language),
        });

        if (response !== 0) return { cleared: false };

        historyStore.clearAll();
        return { cleared: true };
    });
}

module.exports = { registerForecastIpc };

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const settingsStore = require('../services/settingsStore');
const { getRegionForecastText, getRegionSoonestEtaMs, formatDuration } = require('../services/forecast');
const { getMonitoredRegions, getActiveRegionDetail } = require('../services/regionOverview');

function registerForecastIpc() {
    ipcMain.handle('forecast:getRegions', () => getMonitoredRegions(settingsStore.getSettings().language));

    ipcMain.handle('forecast:getRegionForecast', async (event, uid) => {
        const language = settingsStore.getSettings().language;
        const active = await getActiveRegionDetail(uid, language);
        const text = await getRegionForecastText(uid, language);

        if (active) {
            return {
                status: 'active',
                alertLevel: active.alertLevel,
                typeNames: active.typeNames,
                ongoingText: active.ongoingText,
                forecastText: text,
                etaMs: getRegionSoonestEtaMs(uid),
            };
        }

        if (!text) return { status: 'empty' };

        const etaMs = getRegionSoonestEtaMs(uid);
        return { status: 'ok', text, etaMs, etaText: etaMs === null ? null : formatDuration(etaMs, language) };
    });
}

module.exports = { registerForecastIpc };

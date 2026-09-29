// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const regionsStore = require('../services/regionsStore');
const settingsStore = require('../services/settingsStore');
const { getLocationLookup, getAlertCoverageUids, getAncestorUids } = require('../services/locationFilter');
const { getLatestAlertData } = require('../services/activeAlertData');
const {
    getRegionForecastText,
    getRegionSoonestEtaMs,
    getRegionDurationStats,
    buildActiveDurationText,
    buildActiveDurationLines,
} = require('../services/forecast');
const { alertTypeName } = require('../services/alertTypes');
const { worstLevelAmong, getThreatLines } = require('../services/alertLevels');

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
        const activeAlertsHere = activeData
            ? activeData.alerts.filter((alert) => getAlertCoverageUids(alert).includes(String(uid)))
            : [];

        if (activeAlertsHere.length) {
            const activeTypes = [...new Set(activeAlertsHere.map((alert) => alert.alert_type))];
            const durationStats = await getRegionDurationStats(uid, activeTypes);

            const earliestStartedAtByType = new Map();
            const alertsByType = new Map();
            activeAlertsHere.forEach((alert) => {
                const existing = earliestStartedAtByType.get(alert.alert_type);
                if (!existing || new Date(alert.started_at) < new Date(existing)) {
                    earliestStartedAtByType.set(alert.alert_type, alert.started_at);
                }
                if (!alertsByType.has(alert.alert_type)) alertsByType.set(alert.alert_type, []);
                alertsByType.get(alert.alert_type).push(alert);
            });
            durationStats.forEach((entry) => {
                entry.ongoingSinceMs = new Date(earliestStartedAtByType.get(entry.type)).getTime();
                const typeAlerts = alertsByType.get(entry.type) || [];
                entry.alertLevel = worstLevelAmong(typeAlerts);
                entry.threatLines = getThreatLines(typeAlerts.flatMap((alert) => alert.threats || []), language);
            });

            return {
                status: 'active',
                text: buildActiveDurationText(durationStats, language),
                lines: buildActiveDurationLines(durationStats, language),
                alertLevel: worstLevelAmong(activeAlertsHere),
            };
        }

        const text = await getRegionForecastText(uid, language);
        if (!text) return { status: 'empty' };

        return { status: 'ok', text, etaMs: getRegionSoonestEtaMs(uid) };
    });
}

module.exports = { registerForecastIpc };

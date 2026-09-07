// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain, dialog, BrowserWindow } = require('electron');
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
    fetchHistoryAlerts,
} = require('../services/forecast');
const historyStore = require('../services/forecastHistoryStore');
const { logEvent } = require('../services/logger');
const { alertTypeName } = require('../services/alertTypes');
const { worstLevelAmong, getThreatLines } = require('../services/alertLevels');
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
        const activeAlertsHere = activeData
            ? activeData.alerts.filter((alert) => getAlertCoverageUids(alert).includes(String(uid)))
            : [];

        if (activeAlertsHere.length) {
            const activeTypes = [...new Set(activeAlertsHere.map((alert) => alert.alert_type))];
            const durationStats = getRegionDurationStats(uid, activeTypes);

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
        if (!text) {

            fetchHistoryAlerts(uid).catch((err) => logEvent(`Forecast prefetch failed for uid ${uid} (alert-proxy): ${err.message}`, 'NETWORK'));
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

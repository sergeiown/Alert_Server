// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain, nativeImage } = require('electron');
const settingsStore = require('../services/settingsStore');
const { getLatestMatchedAlerts } = require('../services/alertState');
const { alertTypeName } = require('../services/alertTypes');
const { getResourcePath } = require('../services/appPaths');
const { getRegionDurationStats, formatDuration } = require('../services/forecast');
const { getThreatLines } = require('../services/alertLevels');

function registerStatusIpc() {
    ipcMain.handle('app:getIcon', () =>
        nativeImage.createFromPath(getResourcePath('icons', 'app-icon-256.png')).toDataURL()
    );

    ipcMain.handle('status:getAlerts', async () => {
        const language = settingsStore.getSettings().language;

        return Promise.all(getLatestMatchedAlerts().map(async (alert) => {
            const [duration] = await getRegionDurationStats(alert.location_uid, [alert.alert_type]);
            return {
                location: language === 'English' ? alert.location_lat : alert.location_title,
                type: alertTypeName(alert.alert_type, language),
                startedAt: alert.started_at,
                ongoingDuration: formatDuration(Date.now() - new Date(alert.started_at).getTime(), language),
                avgDurationLast24h: duration.avgDurationLast24hMs !== null ? formatDuration(duration.avgDurationLast24hMs, language) : null,
                avgDurationAllTime: duration.avgDurationAllTimeMs !== null ? formatDuration(duration.avgDurationAllTimeMs, language) : null,
                alertLevel: alert.alert_level || null,
                threatLines: getThreatLines(alert.threats, language),
            };
        }));
    });

}

module.exports = { registerStatusIpc };

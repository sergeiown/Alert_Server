// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const regionsStore = require('./regionsStore');
const { getLocationLookup, getAlertCoverageUids, getAncestorUids } = require('./locationFilter');
const { getLatestAlertData } = require('./activeAlertData');
const {
    getRegionDurationStats,
    buildActiveDurationLines,
    prefetchForecast,
    getRegionSoonestEtaMs,
    formatDuration,
} = require('./forecast');
const { alertTypeName } = require('./alertTypes');
const { worstLevelAmong, getThreatLines } = require('./alertLevels');
const { t } = require('../../i18n/i18n');

function getMonitoredRegions(language) {
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
}

function activeAlertsFor(uid) {
    const activeData = getLatestAlertData();
    return activeData ? activeData.alerts.filter((alert) => getAlertCoverageUids(alert).includes(String(uid))) : [];
}

async function getActiveRegionDetail(uid, language) {
    const activeAlertsHere = activeAlertsFor(uid);
    if (!activeAlertsHere.length) return null;

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

    const ongoingMs = Math.max(...durationStats.map((entry) => Date.now() - entry.ongoingSinceMs));
    return {
        alertLevel: worstLevelAmong(activeAlertsHere),
        lines: buildActiveDurationLines(durationStats, language),
        typeNames: activeTypes.map((type) => alertTypeName(type, language)),
        ongoingText: formatDuration(ongoingMs, language),
    };
}

async function getCalmRegionDetail(uid, language) {
    const lines = [{ text: t('statusCalmNow', language), level: null }];
    let sinceLastText = null;
    let nextEtaText = null;

    try {
        const data = await prefetchForecast(uid);
        const stats = data && data.stats;
        if (stats && stats.sinceLastMs !== null && stats.sinceLastMs !== undefined) {
            sinceLastText = formatDuration(stats.sinceLastMs, language);
            const duration = stats.lastAlertDurationMs !== null && stats.lastAlertDurationMs !== undefined
                ? ` ${t('statusCalmLastLasted', language).replace('{duration}', formatDuration(stats.lastAlertDurationMs, language))}`
                : '';
            lines.push({ text: `${t('statusCalmLastEnded', language).replace('{since}', sinceLastText)}${duration}`, level: null });
        }
        const etaMs = getRegionSoonestEtaMs(uid);
        if (etaMs !== null && etaMs !== undefined) {
            nextEtaText = formatDuration(etaMs, language);
            lines.push({ text: `${t('statusCalmNext', language)} ${t('forecastEtaLabel', language)} ${nextEtaText}.`, level: null });
        }
    } catch (err) {
        return { lines, sinceLastText, nextEtaText };
    }

    return { lines, sinceLastText, nextEtaText };
}

async function getRegionOverviews(language) {
    const regions = getMonitoredRegions(language);

    return Promise.all(
        regions.map(async (region) => {
            const active = await getActiveRegionDetail(region.uid, language);
            if (active) return { uid: region.uid, name: region.name, state: 'alert', ...active };

            const calm = await getCalmRegionDetail(region.uid, language);
            return { uid: region.uid, name: region.name, state: 'calm', alertLevel: null, ...calm };
        })
    );
}

module.exports = { getMonitoredRegions, activeAlertsFor, getActiveRegionDetail, getRegionOverviews };

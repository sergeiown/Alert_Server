// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

let latestMatchedAlerts = [];
let latestTotalAlertCount = 0;

function setLatestMatchedAlerts(alerts) {
    latestMatchedAlerts = alerts;
}

function getLatestMatchedAlerts() {
    return latestMatchedAlerts;
}

function setLatestTotalAlertCount(count) {
    latestTotalAlertCount = count;
}

function getLatestTotalAlertCount() {
    return latestTotalAlertCount;
}

let latestAlertedRegions = { oblasts: [], raions: [] };

function setLatestAlertedRegions(regions) {
    latestAlertedRegions = regions;
}

function getLatestAlertedRegions() {
    return latestAlertedRegions;
}

// Which of the alertSourceManager.js chain is actually serving live data right now - can differ
// from settingsStore's alertSourceProvider (the preferred choice) during a failover. Read by the
// live map's attribution line, which would otherwise always claim alerts.in.ua regardless of what
// source (UkraineAlarm, Neptun) is genuinely active.
let activeAlertSource = null;

function setActiveAlertSource(key) {
    activeAlertSource = key;
}

function getActiveAlertSource() {
    return activeAlertSource;
}

module.exports = {
    setLatestMatchedAlerts,
    getLatestMatchedAlerts,
    setLatestTotalAlertCount,
    getLatestTotalAlertCount,
    setLatestAlertedRegions,
    getLatestAlertedRegions,
    setActiveAlertSource,
    getActiveAlertSource,
};

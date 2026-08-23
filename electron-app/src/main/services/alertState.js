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

module.exports = {
    setLatestMatchedAlerts,
    getLatestMatchedAlerts,
    setLatestTotalAlertCount,
    getLatestTotalAlertCount,
    setLatestAlertedRegions,
    getLatestAlertedRegions,
};

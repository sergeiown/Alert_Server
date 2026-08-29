// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

// Whichever source is polling (alerts.in.ua via alertPoller.js, or Neptun via
// neptunAlertsSource.js - see settingsStore's alertSourceProvider), it writes its latest
// transformed alertData here, and everything downstream (forecast, the forecast watcher) reads
// from here instead of caring which one is actually running.

let latestAlertData = null;

function setLatestAlertData(data) {
    latestAlertData = data;
}

function getLatestAlertData() {
    return latestAlertData;
}

module.exports = { setLatestAlertData, getLatestAlertData };

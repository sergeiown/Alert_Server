let latestMatchedAlerts = [];

function setLatestMatchedAlerts(alerts) {
    latestMatchedAlerts = alerts;
}

function getLatestMatchedAlerts() {
    return latestMatchedAlerts;
}

module.exports = { setLatestMatchedAlerts, getLatestMatchedAlerts };

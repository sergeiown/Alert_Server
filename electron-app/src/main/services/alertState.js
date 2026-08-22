let latestMatchedAlerts = [];
let latestTotalAlertCount = 0;

function setLatestMatchedAlerts(alerts) {
    latestMatchedAlerts = alerts;
}

function getLatestMatchedAlerts() {
    return latestMatchedAlerts;
}

// Nationwide count (every active alert from the poll, not just the user's monitored regions) -
// used by the live map's status readout.
function setLatestTotalAlertCount(count) {
    latestTotalAlertCount = count;
}

function getLatestTotalAlertCount() {
    return latestTotalAlertCount;
}

module.exports = {
    setLatestMatchedAlerts,
    getLatestMatchedAlerts,
    setLatestTotalAlertCount,
    getLatestTotalAlertCount,
};

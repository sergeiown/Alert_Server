const fs = require('fs');
const { logEvent } = require('./logger');

const checkLocations = () => {
    try {
        const currentAlertData = JSON.parse(fs.readFileSync('./current_alert.json', 'utf-8'));
        const locationsData = JSON.parse(fs.readFileSync('./location.json', 'utf-8'));

        const locationsWithUsageOne = locationsData.filter((location) => location.Usage === '1');
        const locationsInCurrentAlert = currentAlertData.alerts.filter((alert) =>
            locationsWithUsageOne.some((location) => location.Location === alert.location_oblast)
        );

        if (locationsInCurrentAlert.length > 0) {
            return { alerts: locationsInCurrentAlert };
        } else {
            return { alerts: [] };
        }
    } catch (error) {
        logEvent(`Check location error: ${error.message}`);
        return { alerts: [] };
    }
};

module.exports = { checkLocations };

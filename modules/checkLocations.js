const fs = require('fs').promises;
const { logEvent } = require('./logger');

const checkLocations = async () => {
    try {
        let currentAlertData;

        await new Promise((resolve) => setTimeout(resolve, 5000));

        currentAlertData = JSON.parse(await fs.readFile('./current_alert.json', 'utf-8'));
        const locationsData = JSON.parse(await fs.readFile('./location.json', 'utf-8'));

        const locationsWithUsageOne = locationsData.filter((location) => location.Usage === '1');
        const locationsInCurrentAlert = currentAlertData.alerts.filter((alert) =>
            locationsWithUsageOne.some((location) => location.UID === alert.location_uid)
        );

        logEvent(`Current alert successful update`);

        if (locationsInCurrentAlert.length > 0) {
            return { alerts: locationsInCurrentAlert };
        } else {
            return { alerts: [] };
        }
    } catch (error) {
        logEvent(`Current alert update error: ${error.message}`);
        return { alerts: [] };
    }
};

module.exports = { checkLocations };

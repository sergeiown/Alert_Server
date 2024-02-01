const fs = require('fs');
const { logError } = require('./logger');

const checkLocations = () => {
    try {
        const currentAlertData = JSON.parse(fs.readFileSync('./current_alert.json', 'utf-8'));
        const locationsData = JSON.parse(fs.readFileSync('./location.json', 'utf-8'));

        const locationsWithUsageOne = locationsData.filter((location) => location.Usage === '1');
        const locationsInCurrentAlert = currentAlertData.alerts.filter((alert) =>
            locationsWithUsageOne.some((location) => location.Location === alert.location_oblast)
        );

        if (locationsInCurrentAlert.length > 0) {
            // console.log('Локації з Usage = 1, які є в current_alert.json:', locationsInCurrentAlert);
            return { alerts: locationsInCurrentAlert };
        } else {
            // console.log('Немає локацій з Usage = 1 в current_alert.json');
            return { alerts: [] };
        }
    } catch (error) {
        logError(`Check location error: ${error.message}`);
        return { alerts: [] };
    }
};

module.exports = checkLocations;

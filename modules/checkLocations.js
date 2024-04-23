/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const path = require('path');
const fs = require('fs').promises;
const { logEvent } = require('./logger');
const messages = require('../messages.json');

const checkLocations = async () => {
    try {
        let currentAlertData;

        await new Promise((resolve) => setTimeout(resolve, 3000));

        const currentAlertFilePath = path.join(process.env.TEMP, 'current_alert.json');
        const locationFilePath = path.join(__dirname, '..', 'location.json');
        currentAlertData = JSON.parse(await fs.readFile(currentAlertFilePath, 'utf-8'));
        const locationsData = JSON.parse(await fs.readFile(locationFilePath, 'utf-8'));

        const locationsWithUsageOne = locationsData.filter((location) => location.Usage === '1');
        const locationsInCurrentAlert = currentAlertData.alerts.filter((alert) =>
            locationsWithUsageOne.some((location) => location.UID === alert.location_uid)
        );

        const alertsWithLocationLat = locationsInCurrentAlert.map((alert) => {
            const locationData = locationsData.find((location) => location.UID === alert.location_uid);
            return {
                ...alert,
                location_lat: locationData ? locationData.LocationLat : null,
            };
        });

        if (alertsWithLocationLat.length > 0) {
            logEvent(`${atob(messages.msg_02)} ${alertsWithLocationLat.length}`);
            return { alerts: alertsWithLocationLat };
        } else {
            return { alerts: [] };
        }
    } catch (error) {
        logEvent(atob(messages.msg_07));

        return { alerts: [] };
    }
};

module.exports = { checkLocations };

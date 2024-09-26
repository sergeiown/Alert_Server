/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const path = require('path');
const fs = require('fs').promises;
const { logEvent } = require('./logger');
const messages = require('./messageLoader');

const checkLocations = async () => {
    try {
        let currentAlertData;

        await new Promise((resolve) => setTimeout(resolve, 3000));

        const currentAlertFilePath = path.join(process.cwd(), 'alert_received.json');
        const locationFilePath = path.join(process.cwd(), 'location.json');
        currentAlertData = JSON.parse(await fs.readFile(currentAlertFilePath, 'utf-8'));
        const locationsData = JSON.parse(await fs.readFile(locationFilePath, 'utf-8'));

        const locationsWithUsageOne = [];

        locationsData.states.forEach((state) => {
            if (state.usage === 1) {
                locationsWithUsageOne.push({ ...state, type: 'state' });
            }
            state.districts.forEach((district) => {
                if (district.usage === 1) {
                    locationsWithUsageOne.push({ ...district, type: 'district' });
                }
                district.communities.forEach((community) => {
                    if (community.usage === 1) {
                        locationsWithUsageOne.push({ ...community, type: 'community' });
                    }
                });
            });
        });

        const locationsInCurrentAlert = currentAlertData.alerts.filter((alert) =>
            locationsWithUsageOne.some((location) => String(location.uid) === String(alert.location_uid))
        );

        const alertsWithLocationLat = locationsInCurrentAlert.map((alert) => {
            const locationData = locationsWithUsageOne.find(
                (location) => String(location.uid) === String(alert.location_uid)
            );
            return {
                ...alert,
                location_lat: locationData
                    ? locationData.communityNameLat || locationData.districtNameLat || locationData.stateNameLat
                    : null,
            };
        });

        return { alerts: alertsWithLocationLat.length > 0 ? alertsWithLocationLat : [] };
    } catch (error) {
        logEvent(messages.msg_07);
        return { alerts: [] };
    }
};

module.exports = { checkLocations };

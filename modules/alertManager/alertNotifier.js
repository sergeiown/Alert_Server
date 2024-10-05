/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { checkLocations } = require('./locationChecker');
const { getSettings, updateSetting } = require('../settingsManager');
const { getCurrentLanguage } = require('../languageChecker');
const { playAlertSound, playAlertCancellationSound } = require('./audioPlayer');
const messages = require('../messageLoader');
const { logEvent } = require('../logger');

let alertTypes;

const alertTypesFilePath = path.join(process.cwd(), 'alert_types.json');
alertTypes = JSON.parse(fs.readFileSync(alertTypesFilePath, 'utf-8'));

const displayedAlerts = new Map();
const displayedAlertsFilePath = path.join(process.cwd(), 'alert_displayed.json');

if (fs.existsSync(displayedAlertsFilePath)) {
    const savedAlerts = JSON.parse(fs.readFileSync(displayedAlertsFilePath, 'utf8'));
    savedAlerts.forEach((alert) => displayedAlerts.set(alert.id, alert));
} else {
    fs.writeFileSync(displayedAlertsFilePath, JSON.stringify([]), 'utf8');
}

function saveDisplayedAlerts() {
    const alertsArray = Array.from(displayedAlerts.entries()).map(([id, value]) => ({ id, ...value }));
    fs.writeFileSync(displayedAlertsFilePath, JSON.stringify(alertsArray, null, 2));
}

const showNotification = async () => {
    try {
        const { alerts } = await checkLocations();
        const settings = getSettings();
        const isAudioMarker = settings.alertSound;

        let alertCount = alerts.length;

        updateSetting('alertActive', alertCount);

        alerts.forEach((alert) => {
            const alertType = alertTypes.find((type) => type.id === alert.alert_type);

            if (!displayedAlerts.has(alert.id)) {
                const title =
                    getCurrentLanguage() === 'English'
                        ? `${messages.msg_58}: ${alertType ? alertType.id : alert.alert_type}`
                        : `${messages.msg_58}: ${alertType ? alertType.name : alert.alert_type}`;

                const message =
                    getCurrentLanguage() === 'English'
                        ? `${messages.msg_41} ${alert.location_lat}. ${messages.msg_42} ${alertCount}`
                        : `${messages.msg_41} ${alert.location_title}. ${messages.msg_42} ${alertCount}`;

                const image = path.join(process.cwd(), 'resources', 'images', 'alert.png');

                createNotification(title, message, image);

                if (isAudioMarker) {
                    playAlertSound();
                    setTimeout(playAlertSound, 8000);
                }

                logEvent(`Alert ${alert.alert_type}: ${alert.location_lat}`);
                logEvent(`${messages.msg_02} ${alerts.length}`);

                displayedAlerts.set(alert.id, {
                    locationTitle: alert.location_title,
                    locationLat: alert.location_lat,
                    alertType: alert.alert_type,
                });

                saveDisplayedAlerts();
            }
        });

        displayedAlerts.forEach((value, displayedAlert) => {
            if (!alerts.some((alert) => alert.id === displayedAlert)) {
                const image = path.join(process.cwd(), 'resources', 'images', 'cancel.png');

                const alertType = alertTypes.find((type) => type.id === value.alertType);

                const title =
                    getCurrentLanguage() === 'English'
                        ? `${messages.msg_57}: ${alertType ? alertType.id : 'type is not defined'}`
                        : `${messages.msg_57}: ${alertType ? alertType.name : 'тип не визначено'}`;

                const message =
                    getCurrentLanguage() === 'English'
                        ? `${messages.msg_41} ${value.locationLat}. ${messages.msg_42} ${alertCount}`
                        : `${messages.msg_41} ${value.locationTitle}. ${messages.msg_42} ${alertCount}`;

                createNotification(title, message, image);

                if (isAudioMarker) {
                    playAlertCancellationSound();
                    setTimeout(playAlertCancellationSound, 6000);
                }

                logEvent(`${messages.msg_11} ${value.locationLat}`);
                logEvent(`${messages.msg_02} ${alerts.length}`);

                displayedAlerts.delete(displayedAlert);
                saveDisplayedAlerts();
            }
        });
    } catch (error) {
        logEvent(messages.msg_12 + error.message);
    }
};

function createNotification(title, message, image) {
    const snoreToastPath = path.join(process.cwd(), 'resources', 'snoreToast', 'snoretoast.exe');
    const notificationCommand = `${snoreToastPath} -t "${title}" -m "${message}" -p "${image}" -d long -silent -appID "${messages.msg_22}"`;

    logEvent(messages.msg_21);

    exec(notificationCommand, (error) => {
        if (error) {
            if (error.code === 3) {
                logEvent(messages.msg_60);
            } else if (error.code === 2) {
                logEvent(messages.msg_59);
            } else {
                logEvent(error.message);
            }
        }
    });
}

setInterval(showNotification, 5000);

module.exports = { showNotification };

/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { checkLocations } = require('./checkLocations');
const { playAlertSound, playAlertCancellationSound } = require('./audioPlayer');
const alertTypes = require('../alert.json');
const messages = require('./messages');
const { logEvent } = require('./logger');
const { getCurrentLanguage } = require('./checkLanguage');

const displayedAlerts = new Map();
const tempFilePath = path.join(process.env.TEMP, 'alert_active.tmp');

if (fs.existsSync(tempFilePath)) {
    fs.unlinkSync(tempFilePath);
}

const showNotification = async () => {
    try {
        const { alerts } = await checkLocations();
        const isAudioMarker = checkAlertSoundFile();

        let alertCount = alerts.length;

        fs.writeFileSync(tempFilePath, alertCount.toString());

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

                const image = path.join(__dirname, '..', 'resources', 'images', 'alert.png');

                createNotification(title, message, image);

                if (isAudioMarker) {
                    playAlertSound();
                    setTimeout(playAlertSound, 14000);
                }

                logEvent(`Alert ${alert.alert_type}: ${alert.location_lat}`);

                displayedAlerts.set(alert.id, {
                    locationTitle: alert.location_title,
                    locationLat: alert.location_lat,
                });
            }
        });

        displayedAlerts.forEach((value, displayedAlert) => {
            if (!alerts.some((alert) => alert.id === displayedAlert)) {
                const image = path.join(__dirname, '..', 'resources', 'images', 'cancel.png');

                const title = messages.msg_57;

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

                displayedAlerts.delete(displayedAlert);
            }
        });
    } catch (error) {
        logEvent(messages.msg_12);
    }
};

function createNotification(title, message, image) {
    const snoreToastPath = path.join(__dirname, '..', 'resources', 'snoreToast', 'snoretoast.exe');
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

function checkAlertSoundFile() {
    const tempDir = process.env.temp || process.env.TEMP;
    const alertSoundFilePath = path.join(tempDir, 'alertserver_audio.tmp');
    return fs.existsSync(alertSoundFilePath);
}

setInterval(showNotification, 5000);

module.exports = { showNotification };

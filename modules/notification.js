/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { checkLocations } = require('./checkLocations');
const { playAlertSound, playAlertCancellationSound } = require('./audioPlayer');
const alertTypes = require('../alert.json');
const messages = require('../messages.json');
const { logEvent } = require('./logger');

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
                // Повідомлення про новий alert
                const title = `${alertType ? alertType.name : alert.alert_type}`;
                const message = `Регіон: ${alert.location_title}. Кількість активних тривог на території країни: ${alertCount}`;
                const image = path.join(__dirname, '..', 'resources', 'images', 'tray_alert.png');

                createNotification(title, message, image);

                if (isAudioMarker) {
                    playAlertSound();
                    setTimeout(playAlertSound, 14000);
                }

                logEvent(alert.alert_type);

                displayedAlerts.set(alert.id, alert.location_title);
            }
        });

        displayedAlerts.forEach((locationTitle, displayedAlert) => {
            if (!alerts.some((alert) => alert.id === displayedAlert)) {
                // Повідомлення про відміну тривоги
                const image = path.join(__dirname, '..', 'resources', 'images', 'tray.png');
                const title = 'Тривога скасована';
                const message = `Регіон: ${locationTitle}. Кількість активних тривог на території країни: ${alertCount}`;

                createNotification(title, message, image);

                if (isAudioMarker) {
                    playAlertCancellationSound();
                    setTimeout(playAlertCancellationSound, 6000);
                }

                logEvent(atob(messages.msg_11));

                displayedAlerts.delete(displayedAlert);
            }
        });
    } catch (error) {
        logEvent(atob(messages.msg_12));
    }
};

function createNotification(title, message, image) {
    const snoreToastPath = path.join(__dirname, '..', 'resources', 'snoreToast', 'snoretoast.exe');
    const notificationCommand = `${snoreToastPath} -t "${title}" -m "${message}" -p "${image}" -d long -silent -appID "${atob(
        messages.msg_22
    )}"`;

    exec(notificationCommand, (error) => {
        if (error) {
            logEvent(atob(messages.msg_21));

            return;
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

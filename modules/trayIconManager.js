/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const Tray = require('trayicon');
const fs = require('fs');
const path = require('path');
const {
    createTitleMenu,
    createAlertsMenu,
    createFrontMenu,
    createInfoMenu,
    createSettingsMenu,
    createExitMenu,
} = require('./trayIconMenu');
const messages = require('./messageLoader');
const { getSettings } = require('./settings');

function createTrayIcon() {
    const checkInterval = 2000;
    let isAlertActive = false;
    let trayInstance = null;

    function updateAlertStatus() {
        const settings = getSettings();
        const alertActive = settings.alertActive;
        const trayMonoIcon = settings.trayMonoIcon;

        if (alertActive === 0) {
            if (!isAlertActive) {
                isAlertActive = false;
                updateTrayIcon('normal', alertActive, trayMonoIcon);
            }
        } else {
            if (isAlertActive) {
                isAlertActive = true;
                updateTrayIcon('alert', alertActive, trayMonoIcon);
            } else {
                updateTrayIcon('alert', alertActive, trayMonoIcon);
            }
        }
    }

    function updateIconImagePath(trayMonoIcon) {
        const imagePath = !trayMonoIcon
            ? path.join(process.cwd(), 'resources', 'images', 'tray.ico')
            : path.join(process.cwd(), 'resources', 'images', 'tray_mono.ico');

        const alertImagePath = !trayMonoIcon
            ? path.join(process.cwd(), 'resources', 'images', 'tray_alert.ico')
            : path.join(process.cwd(), 'resources', 'images', 'tray_alert_mono.ico');

        return { imagePath, alertImagePath };
    }

    function updateTrayIcon(state, alertActive, trayMonoIcon) {
        const { imagePath, alertImagePath } = updateIconImagePath(trayMonoIcon);

        if (state === 'start') {
            trayInstance.setMenu(
                createTitleMenu(trayInstance),
                trayInstance.separator(),
                createAlertsMenu(trayInstance),
                createFrontMenu(trayInstance),
                createSettingsMenu(trayInstance),
                createInfoMenu(trayInstance),
                trayInstance.separator(),
                createExitMenu(trayInstance)
            );
            trayInstance.setTitle(messages.msg_23);
            trayInstance.setIcon(fs.readFileSync(imagePath));
            trayInstance.notify(messages.msg_22, messages.msg_25);
        } else if (state === 'normal') {
            trayInstance.setTitle(messages.msg_23);
            trayInstance.setIcon(fs.readFileSync(imagePath));
        } else if (state === 'alert') {
            trayInstance.setTitle(`${messages.msg_24} ${parseInt(alertActive)}`);
            trayInstance.setIcon(fs.readFileSync(alertImagePath));
        }
    }

    function startTrayIcon(option) {
        Tray.create(function (tray) {
            trayInstance = tray;
            updateTrayIcon(option);
            setInterval(updateAlertStatus, checkInterval);
        });
    }

    startTrayIcon('start');
}

module.exports = { createTrayIcon };

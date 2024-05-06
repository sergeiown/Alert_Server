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
} = require('./trayMenu');
const messages = require('../messages.json');

function createTrayIcon() {
    const checkInterval = 5000;
    let isAlertActive = false;

    Tray.create(function (tray) {
        function updateAlertStatus() {
            const alertFilePath = path.join(process.env.TEMP, 'alert_active.tmp');

            fs.readFile(alertFilePath, 'utf8', (err, data) => {
                if (err && err.code === 'ENOENT') {
                    if (isAlertActive) {
                        isAlertActive = false;
                        updateTrayIcon('normal');
                    } else {
                        updateTrayIcon('normal');
                    }
                } else if (!err && parseInt(data) === 0) {
                    if (isAlertActive) {
                        isAlertActive = false;
                        updateTrayIcon('normal');
                    } else {
                        updateTrayIcon('normal');
                    }
                } else if (!err && parseInt(data) !== 0) {
                    isAlertActive = true;
                    updateTrayIcon('alert', data);
                }
            });
        }

        function updateIconImagePath() {
            const tempDir = process.env.temp || process.env.TEMP;
            const monoIconMarkerPath = path.join(tempDir, 'alertserver_icon.tmp');
            const isMonoIconMarkerExists = fs.existsSync(monoIconMarkerPath);

            const imagePath = !isMonoIconMarkerExists
                ? path.join(__dirname, '..', 'resources', 'images', 'tray.png')
                : path.join(__dirname, '..', 'resources', 'images', 'tray_mono.png');

            const alertImagePath = !isMonoIconMarkerExists
                ? path.join(__dirname, '..', 'resources', 'images', 'tray_alert.png')
                : path.join(__dirname, '..', 'resources', 'images', 'tray_alert_mono.png');

            return { imagePath, alertImagePath };
        }

        function updateTrayIcon(state, data) {
            const { imagePath, alertImagePath } = updateIconImagePath();
            const menuTitle = createTitleMenu(tray);
            const alertsItem = createAlertsMenu(tray);
            const frontItem = createFrontMenu(tray);
            const settings = createSettingsMenu(tray);
            const logView = createInfoMenu(tray);
            const quit = createExitMenu(tray);

            if (state === 'start') {
                tray.setMenu(
                    menuTitle,
                    tray.separator(),
                    alertsItem,
                    frontItem,
                    settings,
                    logView,
                    tray.separator(),
                    quit
                );
                tray.setTitle(Buffer.from(messages.msg_23, 'base64').toString('utf8'));
                tray.setIcon(fs.readFileSync(imagePath));
                tray.notify(
                    Buffer.from(messages.msg_22, 'base64').toString('utf8'),
                    Buffer.from(messages.msg_25, 'base64').toString('utf8')
                );
            } else if (state === 'normal') {
                tray.setTitle(Buffer.from(messages.msg_23, 'base64').toString('utf8'));
                tray.setIcon(fs.readFileSync(imagePath));
            } else if (state === 'alert') {
                tray.setTitle(`${Buffer.from(messages.msg_24, 'base64').toString('utf8')} ${parseInt(data)}`);
                tray.setIcon(fs.readFileSync(alertImagePath));
            }
        }

        updateTrayIcon('start');

        setInterval(updateAlertStatus, checkInterval);
    });
}

module.exports = { createTrayIcon };

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
    const imagePath = path.join(__dirname, '..', 'resources', 'images', 'tray.png');
    let isAlertActive = false;

    Tray.create(function (tray) {
        const menuTitle = createTitleMenu(tray);
        const alertsItem = createAlertsMenu(tray);
        const frontItem = createFrontMenu(tray);
        const settings = createSettingsMenu(tray);
        const logView = createInfoMenu(tray);
        const quit = createExitMenu(tray);

        tray.setMenu(menuTitle, tray.separator(), alertsItem, frontItem, settings, logView, tray.separator(), quit);

        function checkAlertStatus() {
            const tempFilePath = path.join(process.env.TEMP, 'alert_active.tmp');

            fs.readFile(tempFilePath, 'utf8', (err, data) => {
                if (err && err.code === 'ENOENT') {
                    if (isAlertActive) {
                        isAlertActive = false;
                        tray.setTitle(Buffer.from(messages.msg_23, 'base64').toString('utf8'));
                        tray.setIcon(fs.readFileSync(imagePath));
                    }
                } else if (!err && parseInt(data) === 0) {
                    if (isAlertActive) {
                        isAlertActive = false;
                        tray.setTitle(Buffer.from(messages.msg_23, 'base64').toString('utf8'));
                        tray.setIcon(fs.readFileSync(imagePath));
                    }
                } else if (!err && parseInt(data) !== 0) {
                    isAlertActive = true;
                    const alertImagePath = path.join(__dirname, '..', 'resources', 'images', 'tray_alert.png');
                    tray.setTitle(`${Buffer.from(messages.msg_24, 'base64').toString('utf8')} ${parseInt(data)}`);
                    tray.setIcon(fs.readFileSync(alertImagePath));
                }
            });
        }

        setInterval(() => {
            checkAlertStatus();
        }, 10000);

        tray.setTitle(Buffer.from(messages.msg_23, 'base64').toString('utf8'));
        tray.notify(
            Buffer.from(messages.msg_22, 'base64').toString('utf8'),
            Buffer.from(messages.msg_25, 'base64').toString('utf8')
        );
        tray.setIcon(fs.readFileSync(imagePath));
    });
}

module.exports = { createTrayIcon };

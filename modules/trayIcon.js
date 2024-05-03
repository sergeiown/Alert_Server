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

            const { imagePath, alertImagePath } = getImagePaths();

            tray.setIcon(fs.readFileSync(imagePath));

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
                    tray.setTitle(`${Buffer.from(messages.msg_24, 'base64').toString('utf8')} ${parseInt(data)}`);
                    tray.setIcon(fs.readFileSync(alertImagePath));
                }
            });
        }

        setInterval(() => {
            checkAlertStatus();
        }, 5000);

        tray.setTitle(Buffer.from(messages.msg_23, 'base64').toString('utf8'));
        const { imagePath } = getImagePaths();
        tray.setIcon(fs.readFileSync(imagePath));
        tray.notify(
            Buffer.from(messages.msg_22, 'base64').toString('utf8'),
            Buffer.from(messages.msg_25, 'base64').toString('utf8')
        );
    });

    function getImagePaths() {
        const isIconMarker = checkTrayMonoIconFile();
        const imagePath = !isIconMarker
            ? path.join(__dirname, '..', 'resources', 'images', 'tray.png')
            : path.join(__dirname, '..', 'resources', 'images', 'tray_mono.png');

        const alertImagePath = !isIconMarker
            ? path.join(__dirname, '..', 'resources', 'images', 'tray_alert.png')
            : path.join(__dirname, '..', 'resources', 'images', 'tray_alert_mono.png');

        return { imagePath, alertImagePath };
    }

    function checkTrayMonoIconFile() {
        const tempDir = process.env.temp || process.env.TEMP;
        const monoIconFilePath = path.join(tempDir, 'alertserver_icon.tmp');
        return fs.existsSync(monoIconFilePath);
    }
}

module.exports = { createTrayIcon };

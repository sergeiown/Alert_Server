/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

const Tray = require('trayicon');
const fs = require('fs');
const path = require('path');
const {
    createTitleMenu,
    createUpdateDateTimeMenu,
    createAlertsMenu,
    createInfoMenu,
    createSettingsMenu,
    createExitMenu,
} = require('./trayMenu');

function createTrayIcon() {
    const imagePath = path.join(__dirname, '../resources/images/tray.png');
    let isAlertActive = false;

    Tray.create(function (tray) {
        const menuTitle = createTitleMenu(tray);
        const UpdateDateTimeMenu = createUpdateDateTimeMenu(tray);
        const alertsItem = createAlertsMenu(tray);
        const settings = createSettingsMenu(tray);
        const logView = createInfoMenu(tray);
        const quit = createExitMenu(tray);

        tray.setMenu(
            menuTitle,
            UpdateDateTimeMenu,
            tray.separator(),
            alertsItem,
            settings,
            logView,
            tray.separator(),
            quit
        );

        // Оновлення іконки трея у відповідності до наявності тривоги
        function checkAlertStatus() {
            const tempFilePath = path.join(process.env.TEMP, 'alert_active.tmp');

            fs.access(tempFilePath, fs.constants.F_OK, (err) => {
                if (err) {
                    if (isAlertActive) {
                        isAlertActive = false;
                        tray.setTitle('Alert server: в заданому регіоні тривога відсутня');
                        tray.setIcon(fs.readFileSync(imagePath));
                    }
                } else {
                    if (!isAlertActive) {
                        isAlertActive = true;
                        const imagePath = path.join(__dirname, '../resources/images/tray_alert.png');
                        tray.setTitle('Alert server: активна тривога!');
                        tray.setIcon(fs.readFileSync(imagePath));
                    }
                }
            });
        }

        setInterval(() => {
            checkAlertStatus();
        }, 5000);

        // Початкові значення
        tray.setTitle('Alert server: в заданому регіоні тривога відсутня');
        tray.notify('Alert server', 'Тpивоги відстежуються.');
        tray.setIcon(fs.readFileSync(imagePath));
    });
}

module.exports = { createTrayIcon };

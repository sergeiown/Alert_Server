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
    let UpdateDateTimeMenu;
    let settings;

    Tray.create(function (tray) {
        // Пункти меню, які не міняються
        const menuTitle = createTitleMenu(tray);
        const alertsItem = createAlertsMenu(tray);
        const logView = createInfoMenu(tray);
        const quit = createExitMenu(tray);

        // Функція для оновлення меню з часом оновлення даних
        async function updateDateTimeMenu() {
            UpdateDateTimeMenu = await createUpdateDateTimeMenu(tray);
            settings = createSettingsMenu(tray);

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
        }

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

        updateDateTimeMenu();
        setInterval(() => {
            checkAlertStatus();
            updateDateTimeMenu();
        }, 5000);

        // Початкові значення
        tray.setTitle('Alert server: в заданому регіоні тривога відсутня');
        tray.notify('Alert server', 'Тpивоги відстежуються.');
        tray.setIcon(fs.readFileSync(imagePath));
    });
}

module.exports = { createTrayIcon };

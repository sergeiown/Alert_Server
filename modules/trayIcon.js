const Tray = require('trayicon');
const fs = require('fs');
const path = require('path');
const { createTitleMenu, createAlertsMenu, createInfoMenu, createSettingsMenu, createExitMenu } = require('./trayMenu');

function createTrayIcon() {
    const imagePath = path.join(__dirname, '../resources/images/tray.png');
    let isAlertActive = false;

    Tray.create(function (tray) {
        // Пункт меню 'Назва'
        const menuTitle = createTitleMenu(tray);

        // Пункт меню 'Перегляд мапи поточних тривог'
        const alertsItem = createAlertsMenu(tray);

        // Пункт меню 'Інформація'
        const logView = createInfoMenu(tray);

        // Пункт меню 'Налаштування'
        const settings = createSettingsMenu(tray);

        // Пункт меню 'Вихід'
        const quit = createExitMenu(tray);

        tray.setMenu(menuTitle, tray.separator(), alertsItem, settings, logView, tray.separator(), quit);

        // Оновлення трея у відповідності до наявності тривоги
        function checkAlertStatus() {
            const tempFilePath = path.join(process.env.TEMP, 'alert_active.tmp');

            fs.access(tempFilePath, fs.constants.F_OK, (err) => {
                if (err) {
                    if (isAlertActive) {
                        isAlertActive = false;
                        const imagePath = path.join(__dirname, '../resources/images/tray.png');
                        tray.setTitle('\uFEFFAlert server: в заданому регіоні тривога відсутня');
                        tray.setIcon(fs.readFileSync(imagePath));
                    }
                } else {
                    if (!isAlertActive) {
                        isAlertActive = true;
                        const imagePath = path.join(__dirname, '../resources/images/tray_alert.png');
                        tray.setTitle('\uFEFFAlert server: активна тривога!');
                        tray.setIcon(fs.readFileSync(imagePath));
                    }
                }
            });
        }

        setInterval(checkAlertStatus, 5000);

        tray.setTitle('Alert server: в заданому регіоні тривога відсутня');

        tray.notify('Alert server', 'Тривоги відстежуються.');

        tray.setIcon(fs.readFileSync(imagePath));
    });
}

module.exports = { createTrayIcon };

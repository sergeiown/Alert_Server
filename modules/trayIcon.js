const Tray = require('trayicon');
const fs = require('fs');
const path = require('path');
const { createAlertsMenu, createInfoMenu, createExitMenu } = require('./trayMenu');

function createTrayIcon() {
    const imagePath = path.join(__dirname, '../resources/images/tray.png');
    let isAlertActive = false;

    Tray.create(function (tray) {
        // Пункт меню 'Поточні тривоги'
        const alertsItem = createAlertsMenu(tray);

        // Пункт меню 'Інформація'
        const logView = createInfoMenu(tray);

        // Пункт меню 'Вихід'
        const quit = createExitMenu(tray);

        tray.setMenu(alertsItem, logView, quit);

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

        tray.notify('Alert server', 'Сервер працює, тривоги відстежуються.');

        tray.setIcon(fs.readFileSync(imagePath));
    });
}

module.exports = { createTrayIcon };

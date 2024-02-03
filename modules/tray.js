const Tray = require('trayicon');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { logEvent } = require('./logger');

function createTrayIcon() {
    const imagePath = path.join(__dirname, '../resources/images/tray.png');
    let isAlertActive = false;

    Tray.create(function (tray) {
        let main = tray.item('Поточні тривоги');

        let alertsItem = tray.item('alerts.in.ua', () => {
            exec('start https://alerts.in.ua/?pwa', (error, stdout, stderr) => {
                if (error) {
                    logEvent(`Помилка відкриття URL: ${error.message}`);
                    return;
                }
            });
        });
        main.add(alertsItem);

        let logView = tray.item('Перегляд журналу');

        let logItem = tray.item('log.csv', () => {
            exec('start log.csv', (error, stdout, stderr) => {
                if (error) {
                    logEvent(`Помилка відкриття журналу: ${error.message}`);
                    return;
                }
            });
        });
        logView.add(logItem);

        let quit = tray.item('Вихід', () => {
            logEvent(`Сервер зупинений користувачем`);
            tray.kill();
            process.exit();
        });

        tray.setMenu(main, logView, quit);

        function checkAlertStatus() {
            const tempFilePath = path.join(process.env.TEMP, 'alert_active.tmp');

            // Змінюємо трей у відповідності до наявності тривоги
            fs.access(tempFilePath, fs.constants.F_OK, (err) => {
                if (err) {
                    if (isAlertActive) {
                        isAlertActive = false;
                        const imagePath = path.join(__dirname, '../resources/images/tray.png');
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

        // Встановлюємо інтервал оновлення трея
        setInterval(checkAlertStatus, 5000);

        tray.setTitle('Alert server');

        tray.notify('Alert server', 'Сервер працює, тривоги відстежуються.');

        tray.setIcon(fs.readFileSync(imagePath));
    });
}

module.exports = { createTrayIcon };

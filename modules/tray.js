const Tray = require('trayicon');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { logEvent } = require('./logger');

function createTrayIcon() {
    const imagePath = path.join(__dirname, '../resources/images/tray.png');
    let isAlertActive = false;

    Tray.create(function (tray) {
        // Пункт меню 'Поточні тривоги'
        let main = tray.item('\uFEFFПоточні тривоги');

        let alertsItem = tray.item('alerts.in.ua', () => {
            exec('start https://alerts.in.ua/?pwa', (error, stdout, stderr) => {
                if (error) {
                    logEvent(`Помилка відкриття URL: ${error.message}`);
                    return;
                }
            });
        });
        main.add(alertsItem);

        // Пункт меню 'Інформація'
        let logView = tray.item('\uFEFFІнформація');

        // Підпункт 'Інформація' => 'Перегляд журналу'
        let logItem = tray.item('\uFEFFПерегляд журналу', () => {
            exec('start log.csv', (error, stdout, stderr) => {
                if (error) {
                    logEvent(`Error opening the log file: ${error.message}`);
                    return;
                }
            });
        });
        logView.add(logItem);

        // Підпункт 'Інформація' => 'Про програму'
        let about = tray.item('\uFEFFПро програму', () => {
            const aboutMessage = `Локальний сервер оновлення тривог - це Node.js сервер, який із завданою періодичністю отримує дані про тривоги з alerts.in.ua API та зберігає їх дані з подальшою обробкою і виводом повідомлення про початок та закінчення тривоги для зазначеного регіону України.                                                                                                                                      Copyright (c) 2024 Serhii I. Myshko`;

            const vbsPath = path.join(__dirname, 'msgbox.vbs');

            fs.writeFileSync(
                vbsPath,
                `MsgBox "${aboutMessage.replace(/\r?\n/g, ' ')}", 64, "Про програму"`,
                'utf-16le'
            );

            exec(`start wscript.exe "${vbsPath}"`, (error, stdout, stderr) => {
                if (error) {
                    logEvent(`Error opening the message window: ${error.message}`);
                    return;
                }

                fs.unlinkSync(vbsPath);
            });
        });

        logView.add(about);

        // Пункт меню 'Вихід'
        let quit = tray.item('\uFEFFВихід', () => {
            logEvent(`The server is stopped by the user`);
            tray.kill();
            process.exit();
        });

        tray.setMenu(main, logView, quit);

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

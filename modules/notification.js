/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

const notifier = require('node-notifier');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { checkLocations } = require('./checkLocations');
const alertTypes = require('../alert.json');
const { playAlertSound, playAlertCancellationSound } = require('./audioPlayer');
const messages = require('../messages.json');
const { logEvent } = require('./logger');

// Зберігаємо ідентифікатори виведених повідомлень разом із location_title
const displayedAlerts = new Map();

// Перевіряємо наявність помилково залишеного з попердньої сесії alert_active.tmp
if (fs.existsSync(path.join(os.tmpdir(), 'alert_active.tmp'))) {
    fs.unlinkSync(path.join(os.tmpdir(), 'alert_active.tmp'));
}

const showNotification = async () => {
    try {
        const { alerts } = await checkLocations();

        alerts.forEach((alert) => {
            // Знаходимо ім'я за ідентифікатором alert_type в файлі alert.json
            const alertType = alertTypes.find((type) => type.id === alert.alert_type);

            // Перевіряємо, чи повідомлення про цей alert вже виведено
            if (!displayedAlerts.has(alert.id)) {
                // Повідомлення про новий alert
                notifier.notify({
                    icon: path.join(__dirname, '../resources/images/alert.png'),
                    title: `${alertType ? alertType.name : alert.alert_type}`,
                    message: `${alert.location_title}`,
                    sound: false,
                    wait: true,
                });
                notifier.on('click', function () {
                    exec('start https://alerts.in.ua/?pwa', (error, stdout, stderr) => {
                        if (error) {
                            logEvent(atob(messages.msg_10));
                            return;
                        }
                        stdout.trim() !== '' ? logEvent(stdout) : null;
                        stderr.trim() !== '' ? logEvent(stderr) : null;
                    });
                });

                // Створюємо файл alert_active.tmp в папці %temp%
                fs.writeFileSync(path.join(os.tmpdir(), 'alert_active.tmp'), '');

                // Подвійне відтворення звукового сповіщення
                playAlertSound();
                setTimeout(playAlertSound, 14000);

                logEvent(alert.alert_type);

                // Зберігаємо інформацію про alert для майбутнього використання
                displayedAlerts.set(alert.id, alert.location_title);
            }
        });

        // Перевіряємо, чи alert, який був виведений, більше не існує
        displayedAlerts.forEach((locationTitle, displayedAlert) => {
            if (!alerts.some((alert) => alert.id === displayedAlert)) {
                // Виводимо повідомлення про відміну тривоги
                notifier.notify({
                    icon: path.join(__dirname, '../resources/images/alert_cancellation.png'),
                    title: 'Тривога скасована',
                    message: `${locationTitle}`,
                    sound: false,
                    wait: true,
                });

                // Видаляємо файл alert_active.tmp з папки %temp%
                fs.unlinkSync(path.join(os.tmpdir(), 'alert_active.tmp'));

                playAlertCancellationSound();
                setTimeout(playAlertCancellationSound, 6000);

                logEvent(atob(messages.msg_11));

                // Видаляємо ідентифікатор зі списку виведених повідомлень
                displayedAlerts.delete(displayedAlert);
            }
        });
    } catch (error) {
        logEvent(atob(messages.msg_12));
    }
};

setInterval(showNotification, 10000);

module.exports = { showNotification };

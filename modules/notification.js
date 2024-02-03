const notifier = require('node-notifier');
const path = require('path');
const fs = require('fs');
const os = require('os');
const checkLocations = require('./checkLocations');
const alertTypes = require('../alert.json');
const { playAlertSound, playAlertCancellationSound } = require('./audioPlayer');
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
                    urgency: 'critical',
                });

                // Створюємо файл alert_active.tmp в папці %temp%
                fs.writeFileSync(path.join(os.tmpdir(), 'alert_active.tmp'), '');

                // Подвійне відтворення звукового сповіщення
                playAlertSound();
                setTimeout(playAlertSound, 14000);

                logEvent(`Alert ${alert.alert_type}: ${alert.location_title}`);

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
                    urgency: 'critical',
                });

                // Видаляємо файл alert_active.tmp з папки %temp%
                fs.unlinkSync(path.join(os.tmpdir(), 'alert_active.tmp'));

                playAlertCancellationSound();
                setTimeout(playAlertCancellationSound, 6000);

                logEvent(`Alert cancellation: ${locationTitle}`);

                // Видаляємо ідентифікатор зі списку виведених повідомлень
                displayedAlerts.delete(displayedAlert);
            }
        });
    } catch (error) {
        logEvent(`Notification error: ${error.message}`);
    }
};

setInterval(showNotification, 15000);

module.exports = { showNotification };

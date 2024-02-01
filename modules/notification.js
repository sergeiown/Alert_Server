const { exec } = require('child_process');
const notifier = require('node-notifier');
const path = require('path');
const checkLocations = require('./checkLocations');
const alertTypes = require('../alert.json');
const playAlertSound = require('./audioPlayer');
const { logError } = require('./logger');

// Зберігаємо ідентифікатори виведених повідомлень разом із location_title
const displayedAlerts = new Map();

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
                    title: `${alertType ? alertType.name : alert.alert_type}`,
                    message: `${alert.location_title}`,
                    sound: false,
                    icon: path.join(__dirname, '../alert.png'),
                    wait: true,
                    urgency: 'critical',
                });

                playAlertSound();

                logError(`Alert ${alert.alert_type}: ${alert.location_title}`);

                // Зберігаємо інформацію про alert для майбутнього використання
                displayedAlerts.set(alert.id, alert.location_title);
            }
        });

        // Перевіряємо, чи alert, який був виведений, більше не існує
        displayedAlerts.forEach((locationTitle, displayedAlert) => {
            if (!alerts.some((alert) => alert.id === displayedAlert)) {
                // Виводимо повідомлення про відміну тривоги
                notifier.notify({
                    title: 'Тривога скасована',
                    message: `${locationTitle}`,
                    sound: true,
                    icon: path.join(__dirname, '../alert.png'),
                    wait: true,
                    urgency: 'critical',
                });

                logError(`Alert is cancelled: ${locationTitle}`);

                // Видаляємо ідентифікатор зі списку виведених повідомлень
                displayedAlerts.delete(displayedAlert);
            }
        });
    } catch (error) {
        logError(`Notification error: ${error.message}`);
    }
};

setInterval(showNotification, 30000);

module.exports = { showNotification };

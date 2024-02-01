const notifier = require('node-notifier');
const path = require('path');
const checkLocations = require('./checkLocations');

// Зберігаємо ідентифікатори виведених повідомлень
const displayedAlerts = new Set();

const showNotification = async () => {
    try {
        const { alerts } = await checkLocations();

        alerts.forEach((alert) => {
            // Перевіряємо, чи повідомлення про цей alert вже виведено
            if (!displayedAlerts.has(alert.id)) {
                // Важливе повідомлення про новий alert
                notifier.notify({
                    title: 'Тривога!',
                    message: `${alert.alert_type}\n${alert.location_title}`,
                    sound: true,
                    icon: path.join(__dirname, '../alert.png'),
                    wait: true,
                    urgency: 'critical',
                });
                // Додаємо ідентифікатор до списку виведених повідомлень
                displayedAlerts.add(alert.id);
            }
        });

        // Перевіряємо, чи alert, який був виведений, більше не існує
        displayedAlerts.forEach((displayedAlert) => {
            if (!alerts.some((alert) => alert.id === displayedAlert)) {
                // Виводимо повідомлення про відміну тривоги
                notifier.notify({
                    title: 'Тривога скасована',
                    message: `Всі тривоги відмінено.\n${alert.location_title}`,
                    sound: true,
                    icon: path.join(__dirname, '../alert.png'),
                    wait: true,
                    urgency: 'critical',
                });
                // Видаляємо ідентифікатор зі списку виведених повідомлень
                displayedAlerts.delete(displayedAlert);
            }
        });
    } catch (error) {
        console.error(`Помилка: ${error.message}`);
    }
};

setInterval(showNotification, 60000);

module.exports = showNotification;

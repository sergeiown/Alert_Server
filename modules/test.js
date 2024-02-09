const { exec } = require('child_process');
const path = require('path');

function showNotification(title, message, image) {
    const snoreToastPath = path.resolve(__dirname, '..', 'resources', 'snoreToast', 'snoretoast.exe');

    exec(
        `${snoreToastPath} -t "${title}" -m "${message}" -p "${image}" -d long -silent -appID "Alert server"`,
        (error) => {
            if (error) {
                console.error(`snoretoast.exe error`, error);
                return;
            }
        }
    );
}

// Приклад використання
showNotification('Нове повідомлення', 'Привіт', 'D:\\Projects\\Current_Alert\\resources\\images\\tray_alert.png');

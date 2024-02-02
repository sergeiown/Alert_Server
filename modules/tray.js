const Tray = require('trayicon');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { logEvent } = require('./logger');

function createTrayIcon() {
    const imagePath = path.join(__dirname, '../resources/images/alert.png');
    const imageBuffer = fs.readFileSync(imagePath);

    Tray.create(function (tray) {
        let main = tray.item('Поточні тривоги');

        let alertsItem = tray.item('alerts.in.ua', () => {
            exec('start https://alerts.in.ua/?pwa', (error, stdout, stderr) => {
                if (error) {
                    logEvent(`Error opening URL: ${error.message}`);
                    return;
                }
            });
        });

        main.add(alertsItem);

        let quit = tray.item('Вихід', () => {
            logEvent(`Server is stopped by user`);
            tray.kill();
            process.exit();
        });

        tray.setMenu(main, quit);

        tray.setTitle('Alert server');

        tray.setIcon(imageBuffer);
    });
}

module.exports = { createTrayIcon };

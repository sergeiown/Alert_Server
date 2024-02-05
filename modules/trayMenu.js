const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { logEvent } = require('./logger');

// Пункт меню 'Назва'
function createTitleMenu(tray) {
    const menuTitle = tray.item('🔔                  Alert server                  🔔', { bold: true, disabled: true });

    return menuTitle;
}

// Пункт меню 'Оновлення даних'
function createUpdateDateTimeMenu(tray) {
    function getLastUpdateDateTime() {
        const filePath = path.join(__dirname, '../current_alert.json');
        const jsonData = fs.readFileSync(filePath, 'utf-8');
        const { last_updated_at } = JSON.parse(jsonData);

        const updatedAt = new Date(last_updated_at);
        const formattedDate = updatedAt
            .toLocaleString('uk-UA', {
                day: 'numeric',
                month: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            })
            .replace(',', '');

        return formattedDate;
    }

    function updateLastUpdateDateTime() {
        const newLastUpdate = getLastUpdateDateTime();
        lastUpdateDateTime = tray.item(`Остання зміна стану: ${newLastUpdate}`, { disabled: true });
    }

    const lastUpdate = getLastUpdateDateTime();
    let lastUpdateDateTime = tray.item(`Остання зміна стану: ${lastUpdate}`, { disabled: true });

    setInterval(updateLastUpdateDateTime, 60000);

    return lastUpdateDateTime;
}

// Пункт меню 'Перегляд мапи поточних тривог'
function createAlertsMenu(tray) {
    const alertsItem = tray.item('Перегляд мапи поточних тривог', () => {
        exec('start https://alerts.in.ua/?pwa', (error, stdout, stderr) => {
            if (error) {
                logEvent(`Error opening URL: ${error.message}`);
                return;
            }
            stdout.trim() !== '' ? logEvent(`stdout: ${stdout}`) : null;
            stderr.trim() !== '' ? logEvent(`stderr: ${stderr}`) : null;
        });
    });

    return alertsItem;
}

// Пункт меню 'Інформація'
function createInfoMenu(tray) {
    const logView = tray.item('Інформація');

    // Підпункт меню 'Інформація' => 'Перегляд журналу'
    function createLogItem(tray) {
        const logItem = tray.item('Файл журналу', () => {
            exec('start log.csv', (error, stdout, stderr) => {
                if (error) {
                    logEvent(`Error opening the log file: ${error.message}`);
                    return;
                }
                stdout.trim() !== '' ? logEvent(`stdout: ${stdout}`) : null;
                stderr.trim() !== '' ? logEvent(`stderr: ${stderr}`) : null;
            });
        });

        return logItem;
    }

    // Підпункт меню 'Інформація' => 'Про програму'
    function createAboutItem(tray) {
        const aboutMessage = `Локальний сервер оновлення тривог - це Node.js сервер, який із заданою періодичністю отримує дані про тривоги з alerts.in.ua API та зберігає їх дані з подальшою обробкою і виводом повідомлення про початок та закінчення тривоги для зазначеного регіону України.                                                                                                                                     Copyright (c) 2024 Serhii I. Myshko`;

        const vbsPath = path.join(__dirname, 'msgbox.vbs');

        const aboutItem = tray.item('Про програму', () => {
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
                stdout.trim() !== '' ? logEvent(`stdout: ${stdout}`) : null;
                stderr.trim() !== '' ? logEvent(`stderr: ${stderr}`) : null;

                fs.unlinkSync(vbsPath);
            });
        });

        return aboutItem;
    }

    logView.add(createLogItem(tray));
    logView.add(createAboutItem(tray));

    return logView;
}

// Пункт меню 'Налаштування'
function createSettingsMenu(tray) {
    const settingsMenu = tray.item('Налаштування');

    // Підпункт меню 'Налаштування' => 'Запускати разом з системою'
    function createRunOnStartupItem(tray) {
        const isFileExists = checkStartupFile();
        const runOnStartupItem = tray.item('Запускати разом з системою', {
            checked: isFileExists,
            action: () => {
                exec(path.join(__dirname, '../startup_activator.bat'), (error, stdout, stderr) => {
                    if (error) {
                        logEvent(`Error executing startup_activator.bat: ${error.message}`);
                        return;
                    }
                    stdout.trim() !== '' ? logEvent(`stdout: ${stdout}`) : null;
                    stderr.trim() !== '' ? logEvent(`stderr: ${stderr}`) : null;
                });
                checkStartupFile() ? logEvent(`Auto startup disabled`) : logEvent(`Auto startup enabled`);
            },
        });

        return runOnStartupItem;
    }

    function checkStartupFile() {
        const startupFilePath = path.join(
            process.env.APPDATA,
            'Microsoft',
            'Windows',
            'Start Menu',
            'Programs',
            'Startup',
            'start_alertserver_hidden.lnk'
        );

        const isFileExists = fs.existsSync(startupFilePath);

        return isFileExists;
    }

    // Підпункт меню 'Налаштування' => 'Регіони для сповіщення'
    function createNotificationRegionsItem(tray) {
        const notificationRegionsItem = tray.item('Регiони для відстеження');

        function updateLocationJson(locations) {
            const jsonPath = path.join(__dirname, '../location.json');

            logEvent('Regions for notification updated');
            fs.writeFileSync(jsonPath, JSON.stringify(locations, null, 2), 'utf-8');
        }

        function createCheckboxItem(tray, location) {
            const checkboxItem = tray.item(location.Location, {
                type: 'checkbox',
                checked: location.Usage === '1',
                action: () => {
                    location.Usage = location.Usage === '1' ? '0' : '1';
                    updateLocationJson(locations);
                },
            });

            return checkboxItem;
        }

        const jsonPath = path.join(__dirname, '../location.json');
        const locations = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

        for (const location of locations) {
            notificationRegionsItem.add(createCheckboxItem(tray, location));
        }

        return notificationRegionsItem;
    }

    settingsMenu.add(createRunOnStartupItem(tray));
    settingsMenu.add(createNotificationRegionsItem(tray));

    return settingsMenu;
}

// Пункт меню 'Вихід'
function createExitMenu(tray) {
    const quit = tray.item('Вихід', {
        bold: true,
        action: () => {
            logEvent(`The server is stopped by the user`);
            tray.kill();
            process.exit();
        },
    });

    return quit;
}

module.exports = {
    createTitleMenu,
    createUpdateDateTimeMenu,
    createAlertsMenu,
    createInfoMenu,
    createSettingsMenu,
    createExitMenu,
};

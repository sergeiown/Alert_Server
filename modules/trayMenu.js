const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { logEvent } = require('./logger');

// Пункт меню 'Назва'
function createTitleMenu(tray) {
    const menuTitle = tray.item('⚠ Alert server', { bold: true, disabled: true });

    return menuTitle;
}

// Пункт меню 'Перегляд мапи поточних тривог'
function createAlertsMenu(tray) {
    const alertsItem = tray.item('\uFEFFПерегляд мапи поточних тривог', () => {
        exec('start https://alerts.in.ua/?pwa', (error, stdout, stderr) => {
            if (error) {
                logEvent(`Error opening URL: ${error.message}`);
                return;
            }
        });
    });

    return alertsItem;
}

// Пункт меню 'Інформація'
function createInfoMenu(tray) {
    const logView = tray.item('\uFEFFІнформація');

    // Підпункт меню 'Інформація' => 'Перегляд журналу'
    function createLogItem(tray) {
        const logItem = tray.item('\uFEFFПерегляд журналу', () => {
            exec('start log.csv', (error, stdout, stderr) => {
                if (error) {
                    logEvent(`Error opening the log file: ${error.message}`);
                    return;
                }
            });
        });

        return logItem;
    }

    // Підпункт меню 'Інформація' => 'Про програму'
    function createAboutItem(tray) {
        const aboutMessage = `Локальний сервер оновлення тривог - це Node.js сервер, який із заданою періодичністю отримує дані про тривоги з alerts.in.ua API та зберігає їх дані з подальшою обробкою і виводом повідомлення про початок та закінчення тривоги для зазначеного регіону України.                                                                                                                                     Copyright (c) 2024 Serhii I. Myshko`;

        const vbsPath = path.join(__dirname, 'msgbox.vbs');

        const aboutItem = tray.item('\uFEFFПро програму', () => {
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

        return aboutItem;
    }

    logView.add(createLogItem(tray));
    logView.add(createAboutItem(tray));

    return logView;
}

// Пункт меню 'Налаштування'
function createSettingsMenu(tray) {
    const settingsMenu = tray.item('\uFEFFНалаштування');

    // Підпункт меню 'Налаштування' => 'Запускати разом з системою'
    function createRunOnStartupItem(tray) {
        const runOnStartupItem = tray.item('\uFEFFЗапускати разом з системою', { checked: true });

        return runOnStartupItem;
    }

    // Підпункт меню 'Налаштування' => 'Регіони для сповіщення'
    function createNotificationRegionsItem(tray) {
        const notificationRegionsItem = tray.item('\uFEFFРегіони для сповіщення');

        function updateLocationJson(locations) {
            const jsonPath = path.join(__dirname, '../location.json');

            logEvent('Оновлення файлу');
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
    const quit = tray.item('\uFEFFВихід', {
        bold: true,
        action: () => {
            logEvent(`The server is stopped by the user`);
            tray.kill();
            process.exit();
        },
    });

    return quit;
}

module.exports = { createTitleMenu, createAlertsMenu, createInfoMenu, createSettingsMenu, createExitMenu };

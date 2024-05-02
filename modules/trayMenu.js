/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { logEvent } = require('./logger');
const messages = require('../messages.json');

// Пункт меню 'Назва'
function createTitleMenu(tray) {
    const menuTitle = tray.item(Buffer.from(messages.msg_26, 'base64').toString('utf8'), {
        bold: true,
        disabled: true,
    });

    return menuTitle;
}

// Пункт меню 'Перегляд мапи поточних тривог'
function createAlertsMenu(tray) {
    const alertsItem = tray.item(Buffer.from(messages.msg_27, 'base64').toString('utf8'), () => {
        exec('start msedge --app=https://alerts.in.ua/?pwa', (error) => {
            if (error) {
                logEvent(atob(messages.msg_10));
                exec('start chrome --app=https://alerts.in.ua/?pwa', (edgeError) => {
                    if (edgeError) {
                        logEvent(atob(messages.msg_10));
                    }
                });
            }
        });
    });

    return alertsItem;
}

// Пункт меню 'Перегляд мапи військових дій'
function createFrontMenu(tray) {
    const alertsItem = tray.item(Buffer.from(messages.msg_43, 'base64').toString('utf8'), () => {
        exec('start msedge --app=https://deepstatemap.live/#6/49.1/31.2', (error) => {
            if (error) {
                logEvent(atob(messages.msg_10));
                exec('start chrome --app=https://deepstatemap.live/#6/49.1/31.2', (edgeError) => {
                    if (edgeError) {
                        logEvent(atob(messages.msg_10));
                    }
                });
            }
        });
    });

    return alertsItem;
}

// Пункт меню 'Інформація'
function createInfoMenu(tray) {
    const logView = tray.item(Buffer.from(messages.msg_29, 'base64').toString('utf8'));

    // Підпункт меню 'Інформація' => 'Перегляд журналу'`
    function createLogItem(tray) {
        const logItem = tray.item(Buffer.from(messages.msg_30, 'base64').toString('utf8'), () => {
            const logFilePath = path.join(process.env.TEMP, 'alertserver_log.csv');

            exec(`notepad ${logFilePath}`, (error) => {
                if (error) {
                    logEvent(atob(messages.msg_13));
                    return;
                }
            });
        });

        return logItem;
    }

    // Підпункт меню 'Інформація' => 'Про програму'
    function createAboutItem(tray) {
        const aboutMessage = Buffer.from(messages.msg_20, 'base64').toString('utf8');
        const titleMessage = Buffer.from(messages.msg_31, 'base64').toString('utf8');
        const vbsPath = path.join(process.env.TEMP, 'msgbox.vbs');

        const aboutItem = tray.item(Buffer.from(messages.msg_31, 'base64').toString('utf8'), () => {
            fs.writeFileSync(vbsPath, `MsgBox "${aboutMessage}", 64, "${titleMessage}"`, 'utf-16le');

            exec(`start wscript.exe "${vbsPath}"`, (error) => {
                if (error) {
                    logEvent(atob(messages.msg_14));
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
    const settingsMenu = tray.item(Buffer.from(messages.msg_32, 'base64').toString('utf8'));

    // Підпункт меню 'Налаштування' => 'Запускати разом з системою'
    function createRunOnStartupItem(tray) {
        const isAudioMarker = checkStartupFile();
        const runOnStartupItem = tray.item(Buffer.from(messages.msg_33, 'base64').toString('utf8'), {
            checked: isAudioMarker,
            action: () => {
                exec(`"${path.join(__dirname, '..', 'startup_activator.bat')}"`, (error) => {
                    if (error) {
                        logEvent(atob(messages.msg_15));

                        return;
                    }
                });
                checkStartupFile() ? logEvent(atob(messages.msg_16)) : logEvent(atob(messages.msg_17));
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
            'Alert server.lnk'
        );

        const isAudioMarker = fs.existsSync(startupFilePath);

        return isAudioMarker;
    }

    // Підпункт меню 'Налаштування' => 'Монохромний значок'
    function createTrayMonoIconItem(tray) {
        let isIconMarker = checkTrayMonoIconFile();
        const trayMonoIcon = tray.item(Buffer.from(messages.msg_44, 'base64').toString('utf8'), {
            checked: isIconMarker,
            action: () => {
                const tempDir = process.env.temp || process.env.TEMP;
                const monoIconFilePath = path.join(tempDir, 'alertserver_icon.tmp');
                if (isIconMarker) {
                    fs.unlinkSync(monoIconFilePath);
                    logEvent(atob(messages.msg_46));
                } else {
                    fs.writeFileSync(monoIconFilePath, '');
                    logEvent(atob(messages.msg_45));
                }
                isIconMarker = !isIconMarker;
                trayMonoIcon.checked = isIconMarker;
            },
        });

        return trayMonoIcon;
    }

    function checkTrayMonoIconFile() {
        const tempDir = process.env.temp || process.env.TEMP;
        const monoIconFilePath = path.join(tempDir, 'alertserver_icon.tmp');
        return fs.existsSync(monoIconFilePath);
    }

    // Підпункт меню 'Налаштування' => 'Звук попередження'
    function createAlertSoundItem(tray) {
        let isAudioMarker = checkAlertSoundFile();
        const alertSoundItem = tray.item(Buffer.from(messages.msg_28, 'base64').toString('utf8'), {
            checked: isAudioMarker,
            action: () => {
                const tempDir = process.env.temp || process.env.TEMP;
                const alertSoundFilePath = path.join(tempDir, 'alertserver_audio.tmp');
                if (isAudioMarker) {
                    fs.unlinkSync(alertSoundFilePath);
                    logEvent(atob(messages.msg_39));
                } else {
                    fs.writeFileSync(alertSoundFilePath, '');
                    logEvent(atob(messages.msg_40));
                }
                isAudioMarker = !isAudioMarker;
                alertSoundItem.checked = isAudioMarker;
            },
        });

        return alertSoundItem;
    }

    function checkAlertSoundFile() {
        const tempDir = process.env.temp || process.env.TEMP;
        const alertSoundFilePath = path.join(tempDir, 'alertserver_audio.tmp');
        return fs.existsSync(alertSoundFilePath);
    }

    // Підпункт меню 'Налаштування' => 'Вибір регіонів'
    function createNotificationRegionsItem(tray) {
        const notificationRegionsItem = tray.item(Buffer.from(messages.msg_34, 'base64').toString('utf8'));

        function updateLocationJson(locations) {
            const jsonPath = path.join(__dirname, '..', 'location.json');

            logEvent(atob(messages.msg_18));
            fs.writeFileSync(jsonPath, JSON.stringify(locations, null, 2), 'utf-8');
        }

        function createCheckboxItem(tray, location) {
            const checkboxItem = tray.item(location.Location, {
                type: 'checkbox',
                checked: location.Usage === '1',
                bold: true,
                action: () => {
                    location.Usage = location.Usage === '1' ? '0' : '1';
                    updateLocationJson(locations);
                },
            });

            return checkboxItem;
        }

        const jsonPath = path.join(__dirname, '..', 'location.json');
        const locations = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

        for (const location of locations) {
            notificationRegionsItem.add(createCheckboxItem(tray, location));
        }

        return notificationRegionsItem;
    }

    settingsMenu.add(createRunOnStartupItem(tray));
    settingsMenu.add(createTrayMonoIconItem(tray));
    settingsMenu.add(createAlertSoundItem(tray));
    settingsMenu.add(createNotificationRegionsItem(tray));

    return settingsMenu;
}

// Пункт меню 'Вихід'
function createExitMenu(tray) {
    const quit = tray.item(Buffer.from(messages.msg_35, 'base64').toString('utf8'), {
        bold: true,
        action: () => {
            logEvent(atob(messages.msg_19));
            tray.kill();
            process.exit();
        },
    });

    return quit;
}

module.exports = {
    createTitleMenu,
    createAlertsMenu,
    createFrontMenu,
    createInfoMenu,
    createSettingsMenu,
    createExitMenu,
};

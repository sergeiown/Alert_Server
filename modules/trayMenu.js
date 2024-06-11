/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { logEvent } = require('./logger');
const messages = require('./messages');
const batFilePath = path.join(__dirname, '..', 'start_alertserver_hidden.bat');

// Пункт меню 'Назва'
function createTitleMenu(tray) {
    const menuTitle = tray.item(messages.msg_26, {
        bold: true,
        disabled: true,
    });

    return menuTitle;
}

// Пункти меню 'Перегляд мап'
function openAppWithFallback(url) {
    const openCommand = (browser, callback) => {
        exec(`start ${browser} --app=${url}`, (error) => {
            if (!error) {
                logEvent(`${messages.msg_49} with ${browser}`);
                callback(true);
            } else {
                logEvent(`${browser} ${messages.msg_10}`);
                callback(false);
            }
        });
    };

    openCommand('msedge', (opened) => {
        if (!opened) {
            openCommand('chrome', (opened) => {
                if (!opened) {
                    exec(`start ${url}`, (fallbackError) => {
                        logEvent(`${messages.msg_49}`);
                        if (fallbackError) {
                            logEvent(messages.msg_10);
                        }
                    });
                }
            });
        }
    });
}

// Пункт меню 'Перегляд мапи поточних тривог'
function createAlertsMenu(tray) {
    const alertsItem = tray.item(messages.msg_27, () => {
        openAppWithFallback(messages.msg_47);
    });

    return alertsItem;
}

// Пункт меню 'Перегляд мапи військових дій'
function createFrontMenu(tray) {
    const frontItem = tray.item(messages.msg_43, () => {
        openAppWithFallback(messages.msg_48);
    });

    return frontItem;
}

// Пункт меню 'Інформація'
function createInfoMenu(tray) {
    const logView = tray.item(messages.msg_29);

    // Підпункт меню 'Інформація' => 'Перегляд журналу'`
    function createLogItem(tray) {
        const logItem = tray.item(messages.msg_30, () => {
            const logFilePath = path.join(process.env.TEMP, 'alertserver_log.csv');

            exec(`notepad ${logFilePath}`, (error) => {
                if (error) {
                    logEvent(messages.msg_13);
                    return;
                }
            });
        });

        return logItem;
    }

    // Підпункт меню 'Інформація' => 'Про програму'
    function createAboutItem(tray) {
        const aboutMessage = messages.msg_20;
        const titleMessage = messages.msg_31;
        const vbsPath = path.join(process.env.TEMP, 'msgbox.vbs');

        const aboutItem = tray.item(messages.msg_31, () => {
            fs.writeFileSync(vbsPath, `MsgBox "${aboutMessage}", 64, "${titleMessage}"`, 'utf-16le');

            exec(`start wscript.exe "${vbsPath}"`, (error) => {
                if (error) {
                    logEvent(messages.msg_14);
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
    const settingsMenu = tray.item(messages.msg_32);

    // Підпункт 'Налаштування' => 'Мова' з підпунктами 'Англійська' та 'Українська'
    function createLanguageMenu(tray) {
        const languageFilePath = path.join(process.env.TEMP, 'alertserver_language.tmp');

        const getCurrentLanguage = () => {
            if (fs.existsSync(languageFilePath)) {
                return fs.readFileSync(languageFilePath, 'utf-8').trim();
            }
            fs.writeFileSync(languageFilePath, 'English', 'utf-8');
            return 'English';
        };

        let currentLanguage = getCurrentLanguage();

        const languageMenu = tray.item(messages.msg_51, {
            type: 'submenu',
        });

        const englishItem = tray.item(messages.msg_52, {
            type: 'checkbox',
            checked: currentLanguage === 'English',
            action: () => {
                if (currentLanguage !== 'English') {
                    fs.writeFileSync(languageFilePath, 'English', 'utf-8');
                    logEvent(messages.msg_53);
                    englishItem.checked = true;
                    ukrainianItem.checked = false;
                    currentLanguage = 'English';

                    exec(`cmd /c "${batFilePath}"`, (error) => {
                        if (error) {
                            logEvent(messages.msg_56);
                            return;
                        }
                    });
                }
            },
        });

        const ukrainianItem = tray.item(messages.msg_54, {
            type: 'checkbox',
            checked: currentLanguage === 'Ukrainian',
            action: () => {
                if (currentLanguage !== 'Ukrainian') {
                    fs.writeFileSync(languageFilePath, 'Ukrainian', 'utf-8');
                    logEvent(messages.msg_55);
                    englishItem.checked = false;
                    ukrainianItem.checked = true;
                    currentLanguage = 'Ukrainian';

                    exec(`cmd /c "${batFilePath}"`, (error) => {
                        if (error) {
                            logEvent(messages.msg_56);
                            return;
                        }
                    });
                }
            },
        });

        languageMenu.add(englishItem);
        languageMenu.add(ukrainianItem);

        return languageMenu;
    }

    // Підпункт меню 'Налаштування' => 'Запускати разом з системою'
    function createRunOnStartupItem(tray) {
        const isAudioMarker = checkStartupFile();
        const runOnStartupItem = tray.item(messages.msg_33, {
            checked: isAudioMarker,
            action: () => {
                exec(`"${path.join(__dirname, '..', 'startup_activator.bat')}"`, (error) => {
                    if (error) {
                        logEvent(messages.msg_15);

                        return;
                    }
                });
                checkStartupFile() ? logEvent(messages.msg_16) : logEvent(messages.msg_17);
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
        const trayMonoIcon = tray.item(messages.msg_44, {
            checked: isIconMarker,
            action: () => {
                const tempDir = process.env.temp || process.env.TEMP;
                const monoIconFilePath = path.join(tempDir, 'alertserver_icon.tmp');
                if (isIconMarker) {
                    fs.unlinkSync(monoIconFilePath);
                    logEvent(messages.msg_46);
                } else {
                    fs.writeFileSync(monoIconFilePath, '');
                    logEvent(messages.msg_45);
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
        const alertSoundItem = tray.item(messages.msg_28, {
            checked: isAudioMarker,
            action: () => {
                const tempDir = process.env.temp || process.env.TEMP;
                const alertSoundFilePath = path.join(tempDir, 'alertserver_audio.tmp');
                if (isAudioMarker) {
                    fs.unlinkSync(alertSoundFilePath);
                    logEvent(messages.msg_39);
                } else {
                    fs.writeFileSync(alertSoundFilePath, '');
                    logEvent(messages.msg_40);
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
        const notificationRegionsItem = tray.item(messages.msg_34);

        function updateLocationJson(locations) {
            const jsonPath = path.join(__dirname, '..', 'location.json');

            logEvent(messages.msg_18);
            fs.writeFileSync(jsonPath, JSON.stringify(locations, null, 2), 'utf-8');
        }

        function createRegionMenu(tray, region) {
            const regionItem = tray.item(region.Location, {
                type: 'submenu',
            });

            for (const location of region.locations) {
                const checkboxItem = tray.item(location.Location, {
                    type: 'checkbox',
                    checked: location.Usage === '1',
                    action: () => {
                        location.Usage = location.Usage === '1' ? '0' : '1';
                        updateLocationJson(locations);
                    },
                });

                regionItem.add(checkboxItem);
            }

            return regionItem;
        }

        const jsonPath = path.join(__dirname, '..', 'location.json');
        const locations = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

        const regions = {};
        for (const location of locations) {
            if (!regions[location.Region]) {
                regions[location.Region] = {
                    Location: location.Region,
                    locations: [],
                };
            }

            regions[location.Region].locations.push(location);
        }

        for (const regionKey in regions) {
            if (regions.hasOwnProperty(regionKey)) {
                const region = regions[regionKey];
                notificationRegionsItem.add(createRegionMenu(tray, region));
            }
        }

        return notificationRegionsItem;
    }

    settingsMenu.add(createLanguageMenu(tray));
    settingsMenu.add(createRunOnStartupItem(tray));
    settingsMenu.add(createTrayMonoIconItem(tray));
    settingsMenu.add(createAlertSoundItem(tray));
    settingsMenu.add(tray.separator());
    settingsMenu.add(createNotificationRegionsItem(tray));

    return settingsMenu;
}

// Пункт меню 'Вихід'
function createExitMenu(tray) {
    const quit = tray.item(messages.msg_35, {
        bold: true,
        action: () => {
            logEvent(messages.msg_19);
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

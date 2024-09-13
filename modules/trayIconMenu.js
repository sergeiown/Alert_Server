/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { getSettings, updateSetting } = require('./settings');
const { logEvent } = require('./logger');
const { getCurrentLanguage } = require('./languageChecker');
const messages = require('./messageLoader');

// Menu item 'Alert Server'
function createTitleMenu(tray) {
    const menuTitle = tray.item(messages.msg_26, {
        bold: true,
        disabled: true,
    });

    return menuTitle;
}

// Items in the 'maps' menu
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

// Menu item 'Map of current alerts'
function createAlertsMenu(tray) {
    const alertsItem = tray.item(messages.msg_27, () => {
        openAppWithFallback(messages.msg_47);
    });

    return alertsItem;
}

// Menu item 'Map of military operations'
function createFrontMenu(tray) {
    const frontItem = tray.item(messages.msg_43, () => {
        openAppWithFallback(messages.msg_48);
    });

    return frontItem;
}

// The menu item "Information
function createInfoMenu(tray) {
    const logView = tray.item(messages.msg_29);

    function createLogItem(tray) {
        const logItem = tray.item(messages.msg_30, () => {
            const logFilePath = path.join(process.cwd(), 'event.log');

            exec('where notepad', (error) => {
                if (error) {
                    exec(`start ${logFilePath}`, (startError) => {
                        if (startError) {
                            logEvent(messages.msg_13);

                            return;
                        }
                    });
                } else {
                    exec(`notepad ${logFilePath}`, (notepadError) => {
                        if (notepadError) {
                            logEvent(messages.msg_13);

                            return;
                        }
                    });
                }
            });
        });

        return logItem;
    }

    // Menu item 'Information' => 'About'
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

// Menu item 'Settings'
function createSettingsMenu(tray) {
    const settingsMenu = tray.item(messages.msg_32);

    // Sub-item "Settings" => "Language" with sub-items "English" and "Ukrainian
    function createLanguageMenu(tray) {
        const batFilePath = path.join(__dirname, '..', 'start_alertserver_hidden.bat');
        let currentLanguage = getCurrentLanguage();

        const languageMenu = tray.item(messages.msg_51, {
            type: 'submenu',
        });

        const englishItem = tray.item(messages.msg_52, {
            type: 'checkbox',
            checked: currentLanguage === 'English',
            action: () => {
                if (currentLanguage !== 'English') {
                    updateSetting('language', 'English');
                    logEvent(messages.msg_53);
                    englishItem.checked = true;
                    ukrainianItem.checked = false;
                    currentLanguage = 'English';

                    exec(`cmd /c "${batFilePath}"`, (error) => {
                        if (error) {
                            logEvent(messages.msg_56);
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
                    updateSetting('language', 'Ukrainian');
                    logEvent(messages.msg_55);
                    englishItem.checked = false;
                    ukrainianItem.checked = true;
                    currentLanguage = 'Ukrainian';

                    exec(`cmd /c "${batFilePath}"`, (error) => {
                        if (error) {
                            logEvent(messages.msg_56);
                        }
                    });
                }
            },
        });

        languageMenu.add(englishItem);
        languageMenu.add(ukrainianItem);

        return languageMenu;
    }

    // Menu item 'Settings' => 'Run at system startup'
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

    // Menu item 'Settings' => 'Monochrome icon'
    function createTrayMonoIconItem(tray) {
        const settings = getSettings();
        let isIconMarker = settings.trayMonoIcon;

        const trayMonoIcon = tray.item(messages.msg_44, {
            checked: isIconMarker,
            action: () => {
                if (isIconMarker) {
                    updateSetting('trayMonoIcon', false);
                    logEvent(messages.msg_46);
                } else {
                    updateSetting('trayMonoIcon', true);
                    logEvent(messages.msg_45);
                }
                isIconMarker = !isIconMarker;
                trayMonoIcon.checked = isIconMarker;
            },
        });

        return trayMonoIcon;
    }

    // Menu item 'Settings' => 'Alert sound'
    function createAlertSoundItem(tray) {
        const settings = getSettings();
        let isAudioMarker = settings.alertSound;

        const alertSoundItem = tray.item(messages.msg_28, {
            checked: isAudioMarker,
            action: () => {
                if (isAudioMarker) {
                    updateSetting('alertSound', false);
                    logEvent(messages.msg_39);
                } else {
                    updateSetting('alertSound', true);
                    logEvent(messages.msg_40);
                }
                isAudioMarker = !isAudioMarker;
                alertSoundItem.checked = isAudioMarker;
            },
        });

        return alertSoundItem;
    }

    // Menu item 'Settings' => 'Region selection'
    function createNotificationRegionsItem(tray) {
        const notificationRegionsItem = tray.item(messages.msg_34);

        function updateLocationJson(locations, location, usage) {
            const jsonPath = path.join(__dirname, '..', 'location.json');
            const action = usage === '1' ? 'added' : 'removed';

            logEvent(`${messages.msg_18}: ${action} ${location}`);
            fs.writeFileSync(jsonPath, JSON.stringify(locations, null, 2), 'utf-8');
        }

        function createRegionMenu(tray, region, language) {
            const regionItem = tray.item(language === 'Ukrainian' ? region.Location : region.LocationLat, {
                type: 'submenu',
            });

            for (const location of region.locations) {
                const field = language === 'Ukrainian' ? 'Location' : 'LocationLat';
                const checkboxItem = tray.item(location[field], {
                    type: 'checkbox',
                    checked: location.Usage === '1',
                    action: () => {
                        location.Usage = location.Usage === '1' ? '0' : '1';
                        updateLocationJson(locations, location.LocationLat, location.Usage);
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
                    LocationLat: location.RegionLat,
                    locations: [],
                };
            }

            regions[location.Region].locations.push(location);
        }

        const language = getCurrentLanguage();

        for (const regionKey in regions) {
            if (regions.hasOwnProperty(regionKey)) {
                const region = regions[regionKey];
                notificationRegionsItem.add(createRegionMenu(tray, region, language));
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

// Menu item "Exit
function createExitMenu(tray) {
    const quit = tray.item(messages.msg_35, {
        bold: true,
        action: () => {
            tray.kill();
            process.exit(0);
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

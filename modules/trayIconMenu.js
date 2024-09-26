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
        const vbsPath = path.join(process.env.TEMP, 'alertserver_msgbox.vbs');

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
        const batFilePath = path.join(process.cwd(), 'start_alertserver_hidden.bat');
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
        const isStartupMarker = checkStartupFile();
        const runOnStartupItem = tray.item(messages.msg_33, {
            checked: isStartupMarker,
            action: () => {
                exec(`"${path.join(process.cwd(), 'startup_activator.bat')}"`, (error) => {
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

        const isStartupMarker = fs.existsSync(startupFilePath);

        return isStartupMarker;
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

        function updateLocationJson(locations, locationNameLat, action) {
            const jsonPath = path.join(process.cwd(), 'location.json');
            logEvent(`${messages.msg_18}: ${locationNameLat} has been ${action}`);
            fs.writeFileSync(jsonPath, JSON.stringify(locations, null, 2), 'utf-8');
        }

        // communities
        function createCommunityMenu(tray, community, language) {
            const communityItem = tray.item(
                language === 'Ukrainian' ? community.communityName : community.communityNameLat,
                {
                    type: 'checkbox',
                    checked: community.usage === 1,
                    action: () => {
                        community.usage = community.usage === 1 ? 0 : 1;
                        const action = community.usage === 1 ? 'added' : 'removed';
                        updateLocationJson(locations, community.communityNameLat, action);
                    },
                }
            );

            return communityItem;
        }

        // districts
        function createDistrictMenu(tray, district) {
            const districtItem = tray.item(
                language === 'Ukrainian' ? district.districtName : district.districtNameLat,
                {
                    type: 'checkbox',
                    checked: district.usage === 1,
                    action: () => {
                        district.usage = district.usage === 1 ? 0 : 1;
                        const action = district.usage === 1 ? 'added' : 'removed';
                        updateLocationJson(locations, district.districtNameLat, action);
                    },
                }
            );

            district.communities
                .sort((a, b) =>
                    language === 'Ukrainian'
                        ? a.communityName.localeCompare(b.communityName)
                        : a.communityNameLat.localeCompare(b.communityNameLat)
                )
                .forEach((community) => {
                    districtItem.add(createCommunityMenu(tray, community, language));
                });

            return districtItem;
        }

        // states
        function createStateMenu(tray, state, language) {
            const stateItem = tray.item(language === 'Ukrainian' ? state.stateName : state.stateNameLat, {
                type: 'checkbox',
                checked: state.usage === 1,
                action: () => {
                    state.usage = state.usage === 1 ? 0 : 1;
                    const action = state.usage === 1 ? 'added' : 'removed';
                    updateLocationJson(locations, state.stateNameLat, action);
                },
            });

            state.districts
                .sort((a, b) =>
                    language === 'Ukrainian'
                        ? a.districtName.localeCompare(b.districtName)
                        : a.districtNameLat.localeCompare(b.districtNameLat)
                )
                .forEach((district) => {
                    stateItem.add(createDistrictMenu(tray, district, stateItem));
                });

            return stateItem;
        }

        const jsonPath = path.join(process.cwd(), 'location.json');
        const locations = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

        const language = getCurrentLanguage();

        locations.states
            .sort((a, b) =>
                language === 'Ukrainian'
                    ? a.stateName.localeCompare(b.stateName)
                    : a.stateNameLat.localeCompare(b.stateNameLat)
            )
            .forEach((state) => {
                notificationRegionsItem.add(createStateMenu(tray, state, language));
            });

        return notificationRegionsItem;
    }

    // Menu item 'Settings' => 'View selected regions'
    function createSelectedMenu(tray) {
        const jsonPath = path.join(process.cwd(), 'location.json');
        const language = getCurrentLanguage();

        const showSelectedItems = () => {
            const vbsPath = path.join(process.env.TEMP, 'alertserver_selectedItems.vbs');

            if (fs.existsSync(vbsPath)) {
                fs.unlinkSync(vbsPath);
            }

            const locations = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

            let selectedItems = '';

            locations.states.forEach((state) => {
                if (state.usage === 1) {
                    selectedItems += vbNewLine();
                    selectedItems +=
                        '' + (language === 'Ukrainian' ? state.stateName : state.stateNameLat) + vbNewLine();
                }

                state.districts.forEach((district) => {
                    if (district.usage === 1 && state.usage !== 1) {
                        selectedItems += vbNewLine();
                    }

                    if (district.usage === 1) {
                        selectedItems +=
                            '  ' +
                            (language === 'Ukrainian' ? district.districtName : district.districtNameLat) +
                            vbNewLine();
                    }

                    district.communities.forEach((community) => {
                        if (community.usage === 1 && district.usage !== 1 && state.usage !== 1) {
                            selectedItems += vbNewLine();
                        }

                        if (community.usage === 1) {
                            selectedItems +=
                                '    ' +
                                (language === 'Ukrainian' ? community.communityName : community.communityNameLat) +
                                vbNewLine();
                        }
                    });
                });
            });

            if (!selectedItems) {
                selectedItems = messages.msg_67;
            }

            fs.writeFileSync(vbsPath, `MsgBox "${selectedItems}", 64, "${messages.msg_66}"`, 'utf-16le');

            exec(`start wscript.exe "${vbsPath}"`, (error) => {
                if (error) {
                    logEvent(messages.msg_14);
                    return;
                }

                fs.unlinkSync(vbsPath);
            });
        };

        const selectedMenu = tray.item(messages.msg_66, () => {
            showSelectedItems();
        });

        return selectedMenu;
    }

    function vbNewLine() {
        return '"& vbCrLf &"';
    }

    settingsMenu.add(createLanguageMenu(tray));
    settingsMenu.add(createRunOnStartupItem(tray));
    settingsMenu.add(createTrayMonoIconItem(tray));
    settingsMenu.add(createAlertSoundItem(tray));
    settingsMenu.add(tray.separator());
    settingsMenu.add(createNotificationRegionsItem(tray));
    settingsMenu.add(createSelectedMenu(tray));

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

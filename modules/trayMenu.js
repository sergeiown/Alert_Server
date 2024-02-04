const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { logEvent } = require('./logger');

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

function createInfoMenu(tray) {
    const logView = tray.item('\uFEFFІнформація');

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

function createExitMenu(tray) {
    const quit = tray.item('\uFEFFВихід', () => {
        logEvent(`The server is stopped by the user`);
        tray.kill();
        process.exit();
    });

    return quit;
}

module.exports = { createAlertsMenu, createInfoMenu, createExitMenu };

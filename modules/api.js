/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

const { logEvent } = require('./logger');
const messages = require('../messages.json');
const { exec } = require('child_process');
const path = require('path');

const exePath = path.join(__dirname, '../resources/apiRequest/apirequest.exe');

const fetchDataAndSaveToFile = async () => {
    try {
        const child = exec(`"${exePath}"`);

        child.stdout.on('data', (data) => {
            logEvent(data);
        });

        child.stderr.on('data', (data) => {
            logEvent(data);
        });

        child.on('close', (code) => {
            if (code !== 0) {
                logEvent(atob(messages.msg_04));
            } else {
                logEvent(atob(messages.msg_02));
            }
        });
    } catch (error) {
        logEvent(atob(messages.msg_03));
    }
};

setInterval(fetchDataAndSaveToFile, 30000);

module.exports = { fetchDataAndSaveToFile };

/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { logEvent } = require('./logger');
const messages = require('./messageLoader');
const { exec } = require('child_process');
const path = require('path');

const exePath = path.join(process.cwd(), 'resources', 'apiRequest', 'apirequest.exe');

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
                logEvent(messages.msg_04);
            }
        });
    } catch (error) {
        logEvent(messages.msg_03);
    }
};

setInterval(fetchDataAndSaveToFile, 60000);

module.exports = { fetchDataAndSaveToFile };

/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { logEvent } = require('./modules/logger');
const { fetchDataAndSaveToFile } = require('./modules/api');
const { showNotification } = require('./modules/notification');
const { createTrayIcon } = require('./modules/trayIcon');
const messages = require('./messages.json');

process.on('uncaughtException', (err) => {
    logEvent(err.message);
});

try {
    logEvent(atob(messages.msg_01));

    fetchDataAndSaveToFile();

    showNotification();

    createTrayIcon();
} catch (err) {
    logEvent(err.message);
}

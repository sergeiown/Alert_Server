/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const { exec } = require('child_process');
const path = require('path');
const { logEvent } = require('./logger');
const messages = require('./messageLoader');

const alertSound = path.join(__dirname, '..', 'resources', 'audio', 'alert.wav');
const alertCancellationSound = path.join(__dirname, '..', 'resources', 'audio', 'alert_cancellation.wav');

const playAlertSound = () => {
    exec(`powershell -c (New-Object System.Media.SoundPlayer '${alertSound}').PlaySync()`, (err) => {
        if (err) {
            logEvent(messages.msg_06);
        }
    });
};

const playAlertCancellationSound = () => {
    exec(`powershell -c (New-Object System.Media.SoundPlayer '${alertCancellationSound}').PlaySync()`, (err) => {
        if (err) {
            logEvent(messages.msg_06);
        }
    });
};

module.exports = { playAlertSound, playAlertCancellationSound };

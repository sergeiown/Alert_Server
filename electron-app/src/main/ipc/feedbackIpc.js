// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { ipcMain } = require('electron');
const { sendFeedback } = require('../services/feedbackSender');

function registerFeedbackIpc() {
    ipcMain.handle('feedback:send', (event, input) => sendFeedback(input));
}

module.exports = { registerFeedbackIpc };

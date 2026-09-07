// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

let latestAlertData = null;

function setLatestAlertData(data) {
    latestAlertData = data;
}

function getLatestAlertData() {
    return latestAlertData;
}

module.exports = { setLatestAlertData, getLatestAlertData };

/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { logEvent } = require('./logger');
const messages = require('../messages.json');

const fetchDataAndSaveToFile = async () => {
    try {
        const info = await getqueryInfo();
        const response = await axios.get(atob(info));
        const data = response.data;
        const alerts = data.alerts;
        const lastUpdatedAt = data.meta.last_updated_at;

        fs.writeFileSync(
            path.join(__dirname, '../current_alert.json'),
            JSON.stringify({ alerts, last_updated_at: lastUpdatedAt }, null, 2)
        );

        logEvent(atob(messages.msg_02));
    } catch (error) {
        logEvent(atob(messages.msg_03));
    }

    async function getqueryInfo() {
        try {
            const url = atob(messages.msg_04);
            const response = await axios.get(url);
            const { info } = response.data;
            return info;
        } catch (error) {
            logEvent(atob(messages.msg_05));
            return null;
        }
    }
};

setInterval(fetchDataAndSaveToFile, 60000);

module.exports = { fetchDataAndSaveToFile };

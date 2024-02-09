// /* Copyright (c) 2024 Serhii I. Myshko
// https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

const path = require('path');
const fs = require('fs');
const https = require('https');
const { logEvent } = require('./logger');
const messages = require('../messages.json');

const fetchDataAndSaveToFile = async () => {
    try {
        const info = await getQueryInfo();
        const response = await getData(info);
        const data = JSON.parse(response);
        const alerts = data.alerts;
        const lastUpdatedAt = data.meta.last_updated_at;
        const currentAlertFilePath = path.join(process.env.TEMP, 'current_alert.json');

        fs.writeFileSync(currentAlertFilePath, JSON.stringify({ alerts, last_updated_at: lastUpdatedAt }, null, 2));

        logEvent(atob(messages.msg_02));
    } catch (error) {
        logEvent(atob(messages.msg_03));
    }
};

const getQueryInfo = async () => {
    return new Promise((resolve, reject) => {
        const url = atob(messages.msg_04);
        https
            .get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    const { info } = JSON.parse(data);
                    resolve(info);
                });
            })
            .on('error', (error) => {
                logEvent(atob(messages.msg_05));
                reject(null);
            });
    });
};

const getData = async (info) => {
    return new Promise((resolve, reject) => {
        const url = atob(info);
        https
            .get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    resolve(data);
                });
            })
            .on('error', (error) => {
                logEvent(atob(messages.msg_05));
                reject(null);
            });
    });
};

setInterval(fetchDataAndSaveToFile, 60000);

module.exports = { fetchDataAndSaveToFile };

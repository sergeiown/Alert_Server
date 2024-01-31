const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { getTokenFromFile } = require('./token');
const { logError } = require('./logger');

const apiUrl = 'https://api.alerts.in.ua/v1/alerts/active.json';
const logFilePath = path.join(__dirname, '../log.txt');

const fetchDataAndSaveToFile = async () => {
    try {
        const token = getTokenFromFile();

        if (!token) {
            logError(
                'Failed to retrieve a token from a file. Make sure that the token.json file has the correct format and contains the token.'
            );
            process.exit(1);
        }

        const options = {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        };

        const response = await axios.get(apiUrl, options);
        const data = response.data;
        const alerts = data.alerts;
        const lastUpdatedAt = data.meta.last_updated_at;

        fs.writeFileSync(
            path.join(__dirname, '../current_alert.json'),
            JSON.stringify({ alerts, last_updated_at: lastUpdatedAt }, null, 2)
        );

        const currentDateTime = new Date().toLocaleString('UA').replace(',', '');
        const successMessage = `${currentDateTime} Successful data update\n`;

        fs.appendFileSync(logFilePath, successMessage, 'utf-8');
    } catch (error) {
        logError(`Error while making an API request: ${error.message}`);
    }
};

module.exports = { fetchDataAndSaveToFile };

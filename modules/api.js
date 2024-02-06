const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { logEvent } = require('./logger');

const apiUrl = 'https://api.alerts.in.ua/v1/alerts/active.json';

const fetchDataAndSaveToFile = async () => {
    try {
        const queryInfo = await getqueryInfo();

        if (!queryInfo) {
            logEvent('Emergency server shutdown');
            process.exit(1);
        }

        const options = {
            headers: {
                Authorization: `Bearer ${queryInfo}`,
            },
        };

        console.log(options);

        const response = await axios.get(apiUrl, options);
        const data = response.data;
        const alerts = data.alerts;
        const lastUpdatedAt = data.meta.last_updated_at;

        fs.writeFileSync(
            path.join(__dirname, '../current_alert.json'),
            JSON.stringify({ alerts, last_updated_at: lastUpdatedAt }, null, 2)
        );

        logEvent(`Successful API request`);
    } catch (error) {
        logEvent(`API request error: ${error.message}`);
    }

    async function getqueryInfo() {
        try {
            const url = 'https://rain-forest.web.app/assets/query_info.json';
            const response = await axios.get(url);
            const info = response.data.info;
            return info;
        } catch (error) {
            logEvent(`Error fetching query info: ${error.message}`);
            return null;
        }
    }
};

setInterval(fetchDataAndSaveToFile, 60000);

module.exports = { fetchDataAndSaveToFile };

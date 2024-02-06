const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { logEvent } = require('./logger');
const query = 'aHR0cHM6Ly9yYWluLWZvcmVzdC53ZWIuYXBwL2Fzc2V0cy9xdWVyeV9pbmZvLmpzb24=';

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

        logEvent(`Successful API request`);
    } catch (error) {
        logEvent(`API request error: ${error.message}`);
    }

    async function getqueryInfo() {
        try {
            const url = atob(query);
            const response = await axios.get(url);
            const { info } = response.data;
            return info;
        } catch (error) {
            logEvent(`Error fetching query info: ${error.message}`);
            process.exit(1);
        }
    }
};

setInterval(fetchDataAndSaveToFile, 60000);

module.exports = { fetchDataAndSaveToFile };

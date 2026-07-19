const fs = require('fs');
const path = require('path');

function loadLocalConfig() {
    const filePath = path.join(__dirname, '..', '..', '..', 'config.local.json');
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

module.exports = { loadLocalConfig };

const fs = require('fs');
const { getResourcePath } = require('./appPaths');

function loadLocalConfig() {
    const filePath = getResourcePath('config.local.json');
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

module.exports = { loadLocalConfig };

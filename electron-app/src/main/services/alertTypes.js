const fs = require('fs');
const { getResourcePath } = require('./appPaths');

let alertTypes = null;

function getAlertTypes() {
    if (!alertTypes) {
        alertTypes = JSON.parse(fs.readFileSync(getResourcePath('data', 'alertTypes.json'), 'utf-8'));
    }
    return alertTypes;
}

function alertTypeName(alertTypeId, language) {
    const type = getAlertTypes().find((entry) => entry.id === alertTypeId);
    if (!type) return alertTypeId;
    return language === 'English' ? type.id : type.name;
}

module.exports = { alertTypeName };

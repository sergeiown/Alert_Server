const fs = require('fs');
const path = require('path');
const { logEvent } = require('./logger');

const tokenFilePath = path.join(__dirname, '../token.json');

const getTokenFromFile = () => {
    try {
        const fileContent = fs.readFileSync(tokenFilePath, 'utf-8');
        return JSON.parse(fileContent).token;
    } catch (error) {
        logEvent(`Reading a token from a file error: ${error.message}`);
        return null;
    }
};

module.exports = { getTokenFromFile };

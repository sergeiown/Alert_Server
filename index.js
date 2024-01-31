const fs = require('fs');
const path = require('path');
const request = require('request');

// Шлях до файлу token.json у корені проекту
const tokenFilePath = path.join(__dirname, 'token.json');
// Шлях до файлу логів
const logFilePath = path.join(__dirname, 'log.txt');

// Функція для отримання токену з файлу
const getTokenFromFile = () => {
    try {
        const fileContent = fs.readFileSync(tokenFilePath, 'utf-8');
        return JSON.parse(fileContent).token;
    } catch (error) {
        logError(`Error reading a token from a file: ${error.message}`);
        return null;
    }
};

// Функція для запису помилок у лог
const logError = (errorMessage) => {
    const currentDateTime = new Date().toLocaleString('UA').replace(',', '');
    const logMessage = `${currentDateTime} ERROR: ${errorMessage}\n`;

    fs.appendFileSync(logFilePath, logMessage, 'utf-8');
};

// Функція для виконання запиту до API та збереження результатів у current_alert.json
const fetchDataAndSaveToFile = () => {
    const token = getTokenFromFile();

    if (!token) {
        logError(
            'Failed to retrieve a token from a file. Make sure that the token.json file has the correct format and contains the token.'
        );
        process.exit(1);
    }

    const apiUrl = 'https://api.alerts.in.ua/v1/alerts/active.json';
    const options = {
        url: apiUrl,
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };

    request.get(options, (error, response, body) => {
        if (error) {
            logError(`Error while making an API request: ${error.message}`);
            return;
        }

        const data = JSON.parse(body);
        const alerts = data.alerts;
        const lastUpdatedAt = data.meta.last_updated_at;

        // Збереження у файл
        fs.writeFileSync('current_alert.json', JSON.stringify({ alerts, last_updated_at: lastUpdatedAt }, null, 2));

        const currentDateTime = new Date().toLocaleString('UA').replace(',', '');
        const successMessage = `${currentDateTime} Successful data update\n`;

        fs.appendFileSync(logFilePath, successMessage, 'utf-8');
    });
};

// Виконуємо перший раз при запуску сервера
const currentDateTime = new Date().toLocaleString('UA').replace(',', '');
const successMessage = `${currentDateTime} Starting the server\n`;

fs.appendFileSync(logFilePath, successMessage, 'utf-8');

fetchDataAndSaveToFile();

// Встановлюємо інтервал для періодичних перевірок (1 хвилина = 60000 мілісекунд)
setInterval(fetchDataAndSaveToFile, 60000);

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const path = require('node:path');

const PORT = Number(process.env.PORT) || 8787;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'alert-proxy.sqlite');

const ALERTS_TOKEN = process.env.ALERTS_TOKEN || '';
const CLIENT_KEY = process.env.CLIENT_KEY || '';
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const UKRAINEALARM_TOKEN = process.env.UKRAINEALARM_TOKEN || '';
const UKRAINEALARM_WEBHOOK_PUBLIC_KEY = (process.env.UKRAINEALARM_WEBHOOK_PUBLIC_KEY || '').replace(/\\n/g, '\n');
const UKRAINEALARM_WEBHOOK_PATH = process.env.UKRAINEALARM_WEBHOOK_PATH || '';
const KAGGLE_TOKEN = process.env.KAGGLE_TOKEN || '';
const KAGGLE_USERNAME = process.env.KAGGLE_USERNAME || '';
const KAGGLE_KEY = process.env.KAGGLE_KEY || '';

module.exports = {
    PORT,
    DATA_DIR,
    DB_PATH,
    ALERTS_TOKEN,
    CLIENT_KEY,
    ADMIN_KEY,
    UKRAINEALARM_TOKEN,
    UKRAINEALARM_WEBHOOK_PUBLIC_KEY,
    UKRAINEALARM_WEBHOOK_PATH,
    KAGGLE_TOKEN,
    KAGGLE_USERNAME,
    KAGGLE_KEY,
};

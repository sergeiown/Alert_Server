// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getUserDataFile } = require('./appPaths');
const { logEvent } = require('./logger');

const LEGACY_FILES = ['forecast_history.json', 'historical_backfill_state.json', 'daily_peak_state.json', 'daily_alert_stats.json'];

function removeLegacyLocalData() {
    LEGACY_FILES.forEach((name) => {
        const filePath = getUserDataFile(name);
        if (!fs.existsSync(filePath)) return;
        try {
            fs.unlinkSync(filePath);
            logEvent(`Removed obsolete local data file: ${name}`, 'INFO');
        } catch (err) {
            logEvent(`Could not remove obsolete local data file ${name}: ${err.message}`, 'WARNING');
        }
    });
}

module.exports = { removeLegacyLocalData };

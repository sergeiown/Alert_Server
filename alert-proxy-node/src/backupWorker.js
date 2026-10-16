// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('./config');

const target = process.argv[2];
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 30000');
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getUserDataFile } = require('./appPaths');
const { logEvent } = require('./logger');

const DUCK_FACTOR = 0.25;
const DUCK_RAMP_MS = 350;
const RESTORE_RAMP_MS = 1000;
const RESTORE_DELAY_MS = 700;

let child = null;
let depth = 0;
let engaged = false;
let restoreTimer = null;

function stateFile() {
    return getUserDataFile('audio_duck_state.txt');
}

function ensureHelper() {
    if (child) return child;
    const scriptPath = getUserDataFile('audio_duck.ps1');
    fs.copyFileSync(path.join(__dirname, '..', 'native', 'audioDuck.ps1'), scriptPath);
    const exeName = path.basename(process.execPath, path.extname(process.execPath));
    const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'ignore'],
        env: { ...process.env, ALERT_DUCK_STATE: stateFile(), ALERT_DUCK_EXCLUDE: exeName },
    });
    helper.on('error', (err) => {
        logEvent(`Audio ducking helper error: ${err.message}`, 'ERROR');
        child = null;
        engaged = false;
    });
    helper.on('exit', () => {
        if (child === helper) child = null;
        engaged = false;
    });
    helper.stdin.on('error', () => {});
    child = helper;
    return helper;
}

function send(command) {
    try {
        ensureHelper().stdin.write(`${command}\n`);
    } catch (err) {
        logEvent(`Audio ducking error: ${err.message}`, 'ERROR');
    }
}

function begin() {
    depth += 1;
    clearTimeout(restoreTimer);
    if (engaged) return;
    engaged = true;
    send(`duck ${DUCK_FACTOR} ${DUCK_RAMP_MS}`);
}

function end() {
    depth = Math.max(0, depth - 1);
    if (depth > 0) return;
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
        if (depth > 0 || !engaged) return;
        engaged = false;
        send(`restore ${RESTORE_RAMP_MS}`);
    }, RESTORE_DELAY_MS);
}

function warmUp() {
    try {
        ensureHelper();
        if (fs.existsSync(stateFile())) send('restore 0');
    } catch (err) {
        logEvent(`Audio ducking warm-up error: ${err.message}`, 'ERROR');
    }
}

function shutdown() {
    clearTimeout(restoreTimer);
    if (!child) return;
    try {
        child.stdin.end();
    } catch (err) {
        return;
    }
}

module.exports = { begin, end, warmUp, shutdown };

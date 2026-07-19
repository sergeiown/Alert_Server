const { exec } = require('child_process');
const { getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');

let isPlaying = false;

function voicePath(language, cancelled) {
    const base = cancelled ? 'alert_cancellation' : 'alert';
    const suffix = language === 'English' ? 'eng' : 'ukr';
    return getResourcePath('audio', `${base}_${suffix}.wav`);
}

function sirenPath(cancelled) {
    return getResourcePath('audio', cancelled ? 'siren_cancel.wav' : 'siren_alert.wav');
}

function play(filePath) {
    if (isPlaying) return;
    isPlaying = true;
    exec(`powershell -c (New-Object System.Media.SoundPlayer '${filePath}').PlaySync()`, (err) => {
        isPlaying = false;
        if (err) logEvent(`Sound playback error: ${err.message}`);
    });
}

function playAlertSound(mode, language) {
    if (mode === 'none') return;
    play(mode === 'voice' ? voicePath(language, false) : sirenPath(false));
}

function playAlertCancellationSound(mode, language) {
    if (mode === 'none') return;
    play(mode === 'voice' ? voicePath(language, true) : sirenPath(true));
}

module.exports = { playAlertSound, playAlertCancellationSound };

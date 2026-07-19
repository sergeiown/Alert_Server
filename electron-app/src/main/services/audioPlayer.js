const { exec } = require('child_process');
const { getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');

let isPlaying = false;

function soundPath(language, cancelled) {
    const base = cancelled ? 'alert_cancellation' : 'alert';
    const suffix = language === 'English' ? 'eng' : 'ukr';
    return getResourcePath('audio', `${base}_${suffix}.wav`);
}

function play(filePath) {
    if (isPlaying) return;
    isPlaying = true;
    exec(`powershell -c (New-Object System.Media.SoundPlayer '${filePath}').PlaySync()`, (err) => {
        isPlaying = false;
        if (err) logEvent(`Sound playback error: ${err.message}`);
    });
}

function playAlertSound(language) {
    play(soundPath(language, false));
}

function playAlertCancellationSound(language) {
    play(soundPath(language, true));
}

module.exports = { playAlertSound, playAlertCancellationSound };

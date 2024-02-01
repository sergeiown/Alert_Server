const { exec } = require('child_process');
const path = require('path');

const playAlertSound = () => {
    // Викликаємо powershell для відтворення звуку без відображення програвача
    exec(
        `powershell -c (New-Object System.Media.SoundPlayer '${path.join(__dirname, '../alert.wav')}').PlaySync()`,
        (err) => {
            if (err) {
                console.error(`Audio playback error: ${err}`);
            }
        }
    );
};

module.exports = playAlertSound;

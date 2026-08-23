// One-off fetch script (not run by the app itself) for Phase 9's weapon-type "Trends" data -
// downloads piterfm's "Massive Missile Attacks on Ukraine" Kaggle dataset, which needs a Kaggle
// account's API credentials (no anonymous/GitHub-mirrored access exists for this one, unlike the
// Vadimkin dataset used for the forecast baseline calibration). Credentials go in the same
// git-ignored resources/config.local.json the alert-proxy client key already lives in - see
// localConfig.js - as "kaggleUsername"/"kaggleKey" (the two fields of a standard kaggle.json).
//
// Usage: node scripts/fetch-kaggle-missile-data.js [outputDir]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DATASET_SLUG = 'piterfm/massive-missile-attacks-on-ukraine';
const DOWNLOAD_URL = `https://www.kaggle.com/api/v1/datasets/download/${DATASET_SLUG}`;

async function main() {
    const outputDir = process.argv[2] || path.join(__dirname, '..', 'tmp-kaggle-data');
    const configPath = path.join(__dirname, '..', 'resources', 'config.local.json');

    if (!fs.existsSync(configPath)) {
        console.error(`Не знайдено ${configPath}`);
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.kaggleUsername || !config.kaggleKey) {
        console.error('У config.local.json відсутні поля "kaggleUsername"/"kaggleKey".');
        process.exit(1);
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const zipPath = path.join(outputDir, 'dataset.zip');

    console.log(`Завантажую ${DATASET_SLUG}...`);
    const auth = Buffer.from(`${config.kaggleUsername}:${config.kaggleKey}`).toString('base64');
    const response = await fetch(DOWNLOAD_URL, { headers: { Authorization: `Basic ${auth}` } });

    if (!response.ok) {
        console.error(`Kaggle API повернув ${response.status}: ${await response.text()}`);
        process.exit(1);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(zipPath, buffer);
    console.log(`Збережено ${zipPath} (${buffer.length} байт)`);

    console.log('Розпаковую...');
    execFileSync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path "${zipPath}" -DestinationPath "${outputDir}" -Force`,
    ]);

    const files = fs.readdirSync(outputDir).filter((f) => f !== 'dataset.zip');
    console.log(`Готово. Файли в ${outputDir}:`, files);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

/* Copyright (c) 2024 Serhii I. Myshko
https://github.com/sergeiown/Alert_Server/blob/main/LICENSE */

'use strict';

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');
const unzip = require('unzipper');
const { logEvent } = require('../logger');
const messages = require('../messageLoader');
const { backupConfigFiles } = require('./configFilesBackupHandler');

const packagePath = path.join(process.cwd(), 'package.json');

let hasCheckedForUpdates = false;

const getLatestVersion = (callback) => {
    const options = {
        hostname: 'api.github.com',
        path: '/repos/sergeiown/Alert_Server/tags',
        method: 'GET',
        headers: {
            'User-Agent': 'node.js',
        },
    };

    https
        .get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                const tags = JSON.parse(data);
                const latestVersion = tags[0]?.name || '';
                callback(latestVersion);
            });
        })
        .on('error', (err) => {
            logEvent(`${messages.msg_68} ${err.message}`);
        });
};

const downloadAndInstallUpdate = (latestVersion) => {
    const downloadUrl = `https://github.com/sergeiown/Alert_Server/releases/download/${latestVersion}/Alert_server_setup.zip`;
    const tempDir = process.env.TEMP;
    const zipPath = path.join(tempDir, 'Alert_server_setup.zip');
    const setupPath = path.join(tempDir, 'Alert_server_setup.bat');

    const downloadFile = (url) => {
        const file = fs.createWriteStream(zipPath);
        https
            .get(url, (response) => {
                if (response.statusCode === 200) {
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close(() => {
                            logEvent(messages.msg_78);

                            fs.stat(zipPath, (err, stats) => {
                                if (err || stats.size === 0) {
                                    logEvent(messages.msg_79);
                                    return;
                                }

                                fs.createReadStream(zipPath)
                                    .pipe(unzip.Extract({ path: tempDir }))
                                    .on('close', () => {
                                        logEvent(messages.msg_80);
                                        fs.unlinkSync(zipPath);
                                        logEvent(messages.msg_81);

                                        exec(`start "" "${setupPath}"`, (err) => {
                                            if (err) {
                                                logEvent(`${messages.msg_82} ${err.message}`);
                                            }
                                        });
                                    })
                                    .on('error', (err) => {
                                        logEvent(`${messages.msg_83} ${err.message}`);
                                    });
                            });
                        });
                    });
                } else if (response.statusCode === 302 && response.headers.location) {
                    logEvent(`${messages.msg_77} ${response.headers.location}`);
                    downloadFile(response.headers.location);
                } else {
                    logEvent(`${messages.msg_76} ${response.statusCode}`);
                }
            })
            .on('error', (err) => {
                logEvent(`${messages.msg_84} ${err.message}`);
            });
    };

    downloadFile(downloadUrl);
};

const checkForUpdates = () => {
    if (hasCheckedForUpdates) return;
    hasCheckedForUpdates = true;

    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const currentVersion = packageData.version;

    getLatestVersion((latestVersion) => {
        if (latestVersion && latestVersion !== currentVersion) {
            const vbsPath = path.join(process.env.TEMP, 'alertserver_update.vbs');

            logEvent(`${messages.msg_72} ${latestVersion}`);

            fs.writeFileSync(
                vbsPath,
                `
                Dim result
                result = MsgBox("${messages.msg_87} ${currentVersion}" & vbCrLf & vbCrLf & _ 
                                "${messages.msg_88} ${latestVersion}" & vbCrLf & vbCrLf & _ 
                                "${messages.msg_89}", vbYesNo + vbQuestion, "${messages.msg_90}")
                If result = vbYes Then
                    WScript.Quit 6 ' Yes
                Else
                    WScript.Quit 7 ' No
                End If
                `,
                'utf-16le'
            );

            exec(`wscript.exe "${vbsPath}"`, (error) => {
                if (error) {
                    if (error.code === 6) {
                        logEvent(messages.msg_73);
                        backupConfigFiles();
                        logEvent(messages.msg_71);
                        downloadAndInstallUpdate(latestVersion);
                    } else if (error.code === 7) {
                        logEvent(messages.msg_74);
                    } else {
                        logEvent(`${messages.msg_14} ${error.message}`);
                    }
                }

                fs.unlinkSync(vbsPath);
            });
        } else {
            logEvent(messages.msg_75);
        }
    });
};

const delayedCheckForUpdates = () => {
    setTimeout(() => {
        checkForUpdates();
    }, 10000);
};

module.exports = {
    delayedCheckForUpdates,
};

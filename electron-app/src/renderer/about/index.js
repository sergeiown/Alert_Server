// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const icon = document.getElementById('icon');
const appTitle = document.getElementById('appTitle');
const body = document.getElementById('body');
const license = document.getElementById('license');
const copyright = document.getElementById('copyright');

const GITHUB_URL = 'https://github.com/sergeiown/Alert_Server';
const WEB_MAP_URL = 'https://alert-proxy-ua.duckdns.org/live/';

async function main() {
    const strings = await window.alertServerAbout.getStrings();
    const version = await window.alertServerAbout.getVersion();
    icon.src = await window.alertServerAbout.getIcon();

    document.title = strings.appName;
    appTitle.textContent = `${strings.appName} v${version}`;
    body.textContent = strings.aboutBody;
    license.textContent = strings.aboutLicense;
    copyright.textContent = strings.aboutCopyright;

    document.getElementById('githubTitle').textContent = strings.aboutGithubTitle;
    document.getElementById('githubHint').textContent = strings.aboutGithubHint;
    document.getElementById('webMapTitle').textContent = strings.aboutWebMapTitle;
    document.getElementById('webMapHint').textContent = strings.aboutWebMapHint;

    [['githubLink', GITHUB_URL], ['webMapLink', WEB_MAP_URL]].forEach(([id, url]) => {
        document.getElementById(id).addEventListener('click', () => window.alertServerAbout.openExternal(url));
    });
}

main();

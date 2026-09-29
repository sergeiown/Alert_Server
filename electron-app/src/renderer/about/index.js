// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const icon = document.getElementById('icon');
const appTitle = document.getElementById('appTitle');
const body = document.getElementById('body');
const license = document.getElementById('license');
const copyright = document.getElementById('copyright');
const githubLink = document.getElementById('githubLink');
const webMapLink = document.getElementById('webMapLink');

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
    githubLink.textContent = GITHUB_URL;
    githubLink.href = GITHUB_URL;

    webMapLink.textContent = WEB_MAP_URL;
    webMapLink.href = WEB_MAP_URL;

    [[githubLink, GITHUB_URL], [webMapLink, WEB_MAP_URL]].forEach(([link, url]) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            window.alertServerAbout.openExternal(url);
        });
    });
}

main();

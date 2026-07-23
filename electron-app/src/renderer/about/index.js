const icon = document.getElementById('icon');
const appTitle = document.getElementById('appTitle');
const body = document.getElementById('body');
const license = document.getElementById('license');
const copyright = document.getElementById('copyright');
const githubLink = document.getElementById('githubLink');

const GITHUB_URL = 'https://github.com/sergeiown/Alert_Server';

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

    githubLink.addEventListener('click', (event) => {
        event.preventDefault();
        window.alertServerAbout.openExternal(GITHUB_URL);
    });
}

main();

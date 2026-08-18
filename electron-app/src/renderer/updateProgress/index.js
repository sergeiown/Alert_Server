const icon = document.getElementById('icon');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');
const percentText = document.getElementById('percentText');

async function main() {
    const strings = await window.alertServerUpdate.getStrings();
    icon.src = await window.alertServerUpdate.getIcon();

    document.title = strings.appName;
    statusText.textContent = strings.updateProgressTitle;

    window.alertServerUpdate.onProgress((percent) => {
        const rounded = Math.round(percent);
        progressBar.value = rounded;
        percentText.textContent = `${rounded}%`;
    });

    window.alertServerUpdate.onStatus((text) => {
        statusText.textContent = text;
    });
}

main();

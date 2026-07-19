const headerText = document.getElementById('header-text');
const appIcon = document.getElementById('app-icon');
const list = document.getElementById('list');

let strings = null;

function formatStartedAt(startedAt) {
    if (!startedAt) return '';
    return new Date(startedAt).toLocaleString(undefined, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

async function render() {
    const alerts = await window.alertServerTrayPopup.getAlerts();
    list.innerHTML = '';

    if (!alerts.length) {
        headerText.textContent = strings.trayPopupNoAlerts;
        const empty = document.createElement('div');
        empty.className = 'no-alerts';
        empty.textContent = strings.trayPopupNoAlerts;
        list.appendChild(empty);
        return;
    }

    headerText.textContent = `${strings.activeInMonitored}: ${alerts.length}`;

    alerts.forEach((alert) => {
        const item = document.createElement('div');
        item.className = 'alert-item';

        const type = document.createElement('div');
        type.className = 'type';
        type.textContent = alert.type;
        item.appendChild(type);

        const location = document.createElement('div');
        location.textContent = alert.location;
        item.appendChild(location);

        const startedAt = document.createElement('div');
        startedAt.className = 'started-at';
        startedAt.textContent = `${strings.alertStartedAt}: ${formatStartedAt(alert.startedAt)}`;
        item.appendChild(startedAt);

        list.appendChild(item);
    });
}

async function main() {
    strings = await window.alertServerTrayPopup.getStrings();
    appIcon.src = await window.alertServerTrayPopup.getIcon();
    window.alertServerTrayPopup.onRefresh(render);
    render();
}

main();

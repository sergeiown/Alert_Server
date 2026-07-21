const headerText = document.getElementById('header-text');
const appIcon = document.getElementById('app-icon');
const list = document.getElementById('list');
const forecastSection = document.getElementById('forecast-section');
const forecastHeader = document.getElementById('forecast-header');
const forecastList = document.getElementById('forecast-list');

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

function formatEta(predictedAt) {
    const totalMinutes = Math.max(0, Math.round((predictedAt - Date.now()) / 60000));
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days) parts.push(`${days}${strings.unitDay}`);
    if (hours) parts.push(`${hours}${strings.unitHour}`);
    if (!days && minutes) parts.push(`${minutes}${strings.unitMinute}`);

    return parts.length ? parts.join(' ') : `<1${strings.unitMinute}`;
}

async function renderForecast() {
    const predictions = await window.alertServerTrayPopup.getForecast();
    forecastList.innerHTML = '';

    if (!predictions.length) {
        forecastSection.classList.add('hidden');
        return;
    }

    forecastSection.classList.remove('hidden');
    forecastHeader.textContent = strings.forecastUpcomingHeader;

    predictions.forEach((prediction) => {
        const item = document.createElement('div');
        item.className = 'forecast-item';

        const name = document.createElement('span');
        name.textContent = prediction.name;
        item.appendChild(name);

        const eta = document.createElement('span');
        eta.textContent = `${strings.forecastEtaLabel} ~${formatEta(prediction.predictedAt)}`;
        item.appendChild(eta);

        forecastList.appendChild(item);
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
    window.alertServerTrayPopup.onRefresh(() => {
        render();
        renderForecast();
    });
    render();
    renderForecast();
}

main();

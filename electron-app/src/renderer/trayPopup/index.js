// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const headerText = document.getElementById('header-text');
const appIcon = document.getElementById('app-icon');
const list = document.getElementById('list');
const forecastSection = document.getElementById('forecast-section');
const forecastMore = document.getElementById('forecast-more');

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

async function renderForecast() {
    // Only a pointer to the Forecast window here, not the per-region breakdown itself - the
    // popup is meant for a quick glance at what's ACTIVE right now, and duplicating the forecast
    // list (already one click away, and already shown in full in that window) just added clutter
    // without adding information.
    const predictions = await window.alertServerTrayPopup.getForecast();

    if (!predictions.length) {
        forecastSection.classList.add('hidden');
        return;
    }

    forecastSection.classList.remove('hidden');
    forecastMore.textContent = strings.forecastMoreDetails;
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

        if (alert.avgDurationLast24h || alert.avgDurationAllTime) {
            const duration = document.createElement('div');
            duration.className = 'duration';
            const parts = [
                alert.avgDurationLast24h ? `${strings.forecastActiveDurationLast24h}: ${alert.avgDurationLast24h}` : null,
                alert.avgDurationAllTime ? `${strings.forecastActiveDurationAllTime}: ${alert.avgDurationAllTime}` : null,
            ].filter(Boolean);
            duration.textContent = `${strings.forecastActiveDurationHeader} (${parts.join(', ')})`;
            item.appendChild(duration);
        }

        list.appendChild(item);
    });
}

async function main() {
    strings = await window.alertServerTrayPopup.getStrings();
    appIcon.src = await window.alertServerTrayPopup.getIcon();
    forecastMore.addEventListener('click', () => window.alertServerTrayPopup.openForecast());
    window.alertServerTrayPopup.onRefresh(() => {
        render();
        renderForecast();
    });
    render();
    renderForecast();
}

main();

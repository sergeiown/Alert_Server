// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const headerText = document.getElementById('header-text');
const appIcon = document.getElementById('app-icon');
const list = document.getElementById('list');
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

function renderForecast() {
    // Always just a pointer to the Forecast window, not the per-region breakdown itself - the
    // popup is meant for a quick glance at what's ACTIVE right now, and duplicating the forecast
    // list (already one click away, and already shown in full in that window) just added clutter
    // without adding information. Shown regardless of whether anything is upcoming soon right now
    // - "where to look" doesn't stop being true just because nothing is imminent at this moment.
    forecastMore.textContent = strings.forecastMoreDetails;
}

async function render() {
    const alerts = await window.alertServerTrayPopup.getAlerts();
    list.innerHTML = '';

    if (!alerts.length) {
        headerText.textContent = strings.trayPopupNoAlerts;
        return;
    }

    headerText.textContent = `${strings.activeInMonitored}: ${alerts.length}`;

    alerts.forEach((alert) => {
        const item = document.createElement('div');
        item.className = 'alert-item';

        const header = document.createElement('div');
        header.className = 'type';
        header.textContent = `${alert.location} - ${alert.type}.`;
        item.appendChild(header);

        const startedAtText = `${strings.alertStartedAt}: ${formatStartedAt(alert.startedAt)}`;
        const timing = document.createElement('div');
        timing.className = 'started-at';
        timing.textContent = alert.ongoingDuration ? `${startedAtText}. ${strings.alertOngoingDuration}: ${alert.ongoingDuration}` : startedAtText;
        item.appendChild(timing);

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

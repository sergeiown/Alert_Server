// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const headerBar = document.getElementById('header');
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

function resizeToFitOneAlert() {
    const items = Array.from(list.children);
    let listHeight;

    if (items.length) {
        const tallestItemHeight = Math.max(
            ...items.map((item) => item.getBoundingClientRect().height + (parseFloat(getComputedStyle(item).marginBottom) || 0))
        );
        const listStyle = getComputedStyle(list);
        const listPadding = (parseFloat(listStyle.paddingTop) || 0) + (parseFloat(listStyle.paddingBottom) || 0);
        listHeight = tallestItemHeight + listPadding;
    } else {
        listHeight = 0;
    }

    list.style.maxHeight = `${listHeight}px`;

    const bodyBorder = 2;
    const totalHeight = headerBar.offsetHeight + listHeight + forecastSection.offsetHeight + bodyBorder;
    window.alertServerTrayPopup.setContentHeight(totalHeight);
}

function renderForecast() {

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

        if (alert.alertLevel === 'red' || alert.alertLevel === 'yellow') {
            item.classList.add(`level-${alert.alertLevel}`);
        }

        const header = document.createElement('div');
        header.className = 'type';
        header.textContent = `${alert.location} - ${alert.type}.`;
        item.appendChild(header);

        const startedAtText = `${strings.alertStartedAt}: ${formatStartedAt(alert.startedAt)}`;
        const timing = document.createElement('div');
        timing.className = 'started-at';
        timing.textContent = alert.ongoingDuration ? `${startedAtText}. ${strings.alertOngoingDuration}: ${alert.ongoingDuration}.` : startedAtText;
        item.appendChild(timing);

        (alert.threatLines || []).forEach((line) => {
            const threat = document.createElement('div');
            threat.className = line.level === 'red' || line.level === 'yellow' ? `threat level-${line.level}` : 'threat';
            threat.textContent = line.text;
            item.appendChild(threat);
        });

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

async function renderAll() {
    await render();
    renderForecast();
    resizeToFitOneAlert();
}

async function main() {
    strings = await window.alertServerTrayPopup.getStrings();
    appIcon.src = await window.alertServerTrayPopup.getIcon();
    forecastMore.addEventListener('click', () => window.alertServerTrayPopup.openForecast());
    window.alertServerTrayPopup.onRefresh(() => {
        renderAll();
    });
    renderAll();
}

main();

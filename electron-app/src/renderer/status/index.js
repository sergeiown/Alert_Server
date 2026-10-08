// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { tileSvg } from '../hub/tileIcons.js';

const REFRESH_MS = 5000;

const summary = document.getElementById('summary');
const summaryTitle = document.getElementById('summaryTitle');
const summaryHint = document.getElementById('summaryHint');
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

function addLine(item, className, text) {
    const line = document.createElement('div');
    line.className = className;
    line.textContent = text;
    item.appendChild(line);
}

function buildAlertItem(alert) {
    const item = document.createElement('div');
    item.className = 'alert-item';
    if (alert.alertLevel === 'red' || alert.alertLevel === 'yellow') item.classList.add(`level-${alert.alertLevel}`);

    addLine(item, 'type', `${alert.location} - ${alert.type}.`);

    const startedAtText = `${strings.alertStartedAt}: ${formatStartedAt(alert.startedAt)}`;
    addLine(item, 'started-at', alert.ongoingDuration ? `${startedAtText}. ${strings.alertOngoingDuration}: ${alert.ongoingDuration}.` : startedAtText);

    (alert.threatLines || []).forEach((line) => {
        addLine(item, line.level === 'red' || line.level === 'yellow' ? `threat level-${line.level}` : 'threat', line.text);
    });

    if (alert.avgDurationLast24h || alert.avgDurationAllTime) {
        const parts = [
            alert.avgDurationLast24h ? `${strings.forecastActiveDurationLast24h}: ${alert.avgDurationLast24h}` : null,
            alert.avgDurationAllTime ? `${strings.forecastActiveDurationAllTime}: ${alert.avgDurationAllTime}` : null,
        ].filter(Boolean);
        addLine(item, 'duration', `${strings.forecastActiveDurationHeader} (${parts.join(', ')})`);
    }

    return item;
}

async function render() {
    const alerts = await window.alertServerStatus.getAlerts();
    const alerting = alerts.length > 0;

    summary.classList.toggle('alerting', alerting);
    document.getElementById('summaryIcon').innerHTML = tileSvg('status');
    summaryTitle.textContent = alerting ? strings.hubStatusActive.replace('{count}', alerts.length) : strings.hubStatusCalm;
    summaryHint.textContent = alerting ? `${strings.activeInMonitored}: ${alerts.length}` : strings.trayPopupNoAlerts;

    list.replaceChildren(...alerts.map(buildAlertItem));
}

async function main() {
    strings = await window.alertServerStatus.getStrings();
    document.title = strings.menuStatus;
    document.getElementById('openForecast').textContent = strings.forecastMoreDetails;
    document.getElementById('openLiveMap').textContent = strings.menuLiveMap;
    document.getElementById('openForecast').addEventListener('click', () => window.alertServerStatus.openForecast());
    document.getElementById('openLiveMap').addEventListener('click', () => window.alertServerStatus.openLiveMap());

    window.alertServerStatus.onRefresh(render);
    await render();
    setInterval(render, REFRESH_MS);
}

main();

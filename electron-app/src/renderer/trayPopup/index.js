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

// The window itself has no fixed height - it's resized to fit whatever's actually on screen,
// capped at the height of the TALLEST single alert card (not the whole list) so a region with many
// simultaneous alerts still opens at a sane, predictable size and scrolls for the rest, rather than
// growing without bound or (the previous fixed-height behavior) cutting a single detailed card off
// entirely. Each item's own rendered height is measured directly (true regardless of the list
// container's own overflow clipping) rather than assumed - cards can differ in height (not every
// alert has a threat description or history to show an average duration for), so the tallest one
// is what the cap has to fit, not just whichever happens to be first.
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

    const bodyBorder = 2; // 1px solid border on each side, per index.css
    const totalHeight = headerBar.offsetHeight + listHeight + forecastSection.offsetHeight + bodyBorder;
    window.alertServerTrayPopup.setContentHeight(totalHeight);
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

        // "level-red"/"level-yellow" tint the item's border/background to match the same
        // red/yellow classification the live map and notifications now use - unset (older cached
        // data, or a source that hasn't reported a level) keeps the original neutral styling.
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

        if (alert.threatDescription) {
            const threat = document.createElement('div');
            threat.className = 'threat';
            threat.textContent = alert.threatDescription;
            item.appendChild(threat);
        }

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

// render() itself is async (awaits the getAlerts() IPC round-trip) - resizeToFitOneAlert() has to
// run after it actually finishes, not right after calling it, or it measures the DOM from before
// the alert list was populated.
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

// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const CLOCK_TICK_MS = 1000;
const ALERT_COUNT_REFRESH_MS = 30000;

function formatClock(now, language) {
    const locale = language === 'English' ? 'en-US' : 'uk-UA';
    const datePart = now.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    const timePart = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${datePart} · ${timePart}`;
}

function startStatusBar(strings, language) {
    const statusBarEl = document.getElementById('statusBar');
    const clockEl = document.getElementById('statusClock');
    const countEl = document.getElementById('statusAlertCount');

    let alertCount = 0;
    let threatCount = 0;
    let alertPeak = 0;
    let threatPeak = 0;

    function syncStatusBarHeight() {
        document.documentElement.style.setProperty('--status-bar-height', `${statusBarEl.offsetHeight}px`);
    }

    function tickClock() {
        clockEl.textContent = formatClock(new Date(), language);
    }

    function renderCounts() {
        const alertsLine = strings.liveMapStatusAlertsLine
            .replace('{alerts}', alertCount)
            .replace('{alertsPeak}', Math.max(alertPeak, alertCount));
        const threatsLine = strings.liveMapStatusThreatsLine
            .replace('{threats}', threatCount)
            .replace('{threatsPeak}', Math.max(threatPeak, threatCount));

        countEl.innerHTML = '';
        [alertsLine, threatsLine].forEach((line) => {
            const row = document.createElement('div');
            row.className = 'status-count-row';
            row.textContent = line;
            countEl.appendChild(row);
        });
        syncStatusBarHeight();
    }

    async function refreshAlertCount() {
        alertCount = await window.alertServerLiveMap.getActiveAlertCount();
        const peaks = await window.alertServerLiveMap.getDailyPeaks();
        alertPeak = peaks.alertPeak;
        threatPeak = peaks.threatPeak;
        renderCounts();
    }

    function setThreatCount(count) {
        threatCount = count;
        renderCounts();
    }

    tickClock();
    setInterval(tickClock, CLOCK_TICK_MS);

    refreshAlertCount();
    setInterval(refreshAlertCount, ALERT_COUNT_REFRESH_MS);

    return { setThreatCount };
}

export { startStatusBar };
